import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { CorpseManagerService } from '../worlds/corpse-manager.service.js';
import { MONSTER_SPECIES } from '../monsters/monster.js';
import { NPCS } from '../worlds/npcs.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap } from '../../shared/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { STARTING_MAP, DIRECTIONS } from '../../shared/constants.js';
import {
  type CombatantStats,
  PUNCH_SKILL,
  STARTING_LEVEL,
  STARTING_EXP,
  STARTING_ATTRIBUTE,
  STARTING_VITAL,
  STARTING_SKILL_PERCENT,
  MAX_SKILL_PERCENT,
  SKILL_GROWTH_CHANCE,
  LEVEL_UP_ATTRIBUTE_BONUS,
  LEVEL_UP_VITAL_BONUS,
  PLAYER_KILL_EXP_REWARD,
  punchDamage,
  expGainFor,
  applyExpGain,
} from '../combat/formulas.js';
import type { AppConfig } from '../config/configuration.js';
import type { PlayerSnapshot, GameServer, GameSocket, CombatEventPayload } from '../../shared/types.js';
import type { Direction, MapName } from '../../shared/constants.js';

const directionSchema = z.enum(DIRECTIONS);
const MONSTER_TICK_INTERVAL_MS = 3000;
// Every map with an actively-spawned monster species — driven off the
// species table itself so a future maxCount bump doesn't also need a
// broadcast-list edit here.
const ACTIVE_MONSTER_MAPS: MapName[] = [...new Set(MONSTER_SPECIES.filter((s) => s.maxCount > 0).map((s) => s.homeMap))];

// The socket-level counterpart to the auth HTTP surface — connection
// lifecycle (rate-limit -> JWT -> Redis session validation -> per-socket
// command rate limiting), movement, and a small contact-based combat
// system (one skill: punch). Still much smaller than the text game's own
// GameGateway (no equipment, no dodge/parry, no multi-round auto-battle —
// a punch is a single instant action).
@WebSocketGateway()
export class GameGateway implements OnGatewayInit<GameServer>, OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket> {
  @WebSocketServer()
  private server!: GameServer;

  private readonly commandLimiters = new Map<string, CommandRateLimiter>();
  private readonly commandLimiterOptions: CommandRateLimiterOptions;

  constructor(
    private readonly playersService: PlayersService,
    private readonly worldManager: WorldManagerService,
    private readonly monsterManager: MonsterManagerService,
    private readonly corpseManager: CorpseManagerService,
    private readonly authService: AuthService,
    private readonly sessionStore: SessionStoreService,
    private readonly activeConnections: ActiveConnectionsService,
    private readonly connectionLimiter: SocketConnectionLimiterService,
    configService: ConfigService<AppConfig, true>
  ) {
    this.commandLimiterOptions = {
      max: configService.get('commandRateLimitMax', { infer: true }),
      refillPerSec: configService.get('commandRateLimitRefillPerSec', { infer: true }),
    };
  }

  afterInit(server: GameServer): void {
    this.activeConnections.setServer(server);

    // Break the Monsters<->Worlds circular-dependency risk with a plain
    // callback instead of a compile-time module cycle: this is the one
    // place both services are already available together.
    this.monsterManager.setPlayerOccupancyChecker((mapName, row, col) => this.worldManager.isPlayerAt(mapName, row, col));
    this.monsterManager.spawnInitial();

    setInterval(() => {
      this.monsterManager.wanderAll();
      this.monsterManager.respawnBelowMax();
      for (const mapName of ACTIVE_MONSTER_MAPS) {
        this.server.to(mapName).emit('map:state', this.worldManager.getMapState(mapName));
      }
    }, MONSTER_TICK_INTERVAL_MS);

    server.use(async (socket, next) => {
      const ip = socket.handshake.address;
      if (this.connectionLimiter.isRateLimited(ip)) {
        next(new Error('Too many connection attempts. Please slow down.'));
        return;
      }

      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Missing session token.'));
        return;
      }

      let payload: Awaited<ReturnType<AuthService['verifySessionToken']>>;
      try {
        payload = await this.authService.verifySessionToken(token);
      } catch {
        next(new Error('Invalid or expired session.'));
        return;
      }

      const valid = await this.sessionStore.isSessionValid(payload.username, payload.sessionId);
      if (!valid) {
        next(new Error('Session expired or replaced elsewhere.'));
        return;
      }

      socket.data.username = payload.username;
      next();
    });
  }

  private snapshotFor(client: GameSocket): PlayerSnapshot {
    return {
      username: client.data.username,
      race: client.data.race,
      map: client.data.map,
      row: client.data.row,
      col: client.data.col,
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      movement: client.data.movement,
      maxMovement: client.data.maxMovement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      skills: client.data.skills,
      inventory: client.data.inventory,
    };
  }

  private attackerStatsFor(client: GameSocket): CombatantStats {
    return {
      level: client.data.level,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
    };
  }

  private async persistPosition(client: GameSocket): Promise<void> {
    try {
      await this.playersService.updatePosition(client.data.username, {
        map: client.data.map,
        row: client.data.row,
        col: client.data.col,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player position:', message);
    }
  }

  private async persistStats(client: GameSocket): Promise<void> {
    try {
      await this.playersService.updateStats(client.data.username, {
        hp: client.data.hp,
        maxHp: client.data.maxHp,
        mana: client.data.mana,
        maxMana: client.data.maxMana,
        movement: client.data.movement,
        maxMovement: client.data.maxMovement,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        level: client.data.level,
        exp: client.data.exp,
        skills: client.data.skills,
        inventory: client.data.inventory,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player stats:', message);
    }
  }

  // Applies exp gain, rolling any level-ups (attribute/vital bonuses, a
  // full heal to the new max) — mirrors the text game's own
  // GameGateway.grantExp. Also nudges WorldManagerService's cached copy
  // of this player's state so occupancy/combat lookups against them by
  // OTHER players stay accurate. Returns whether they leveled up.
  private grantExp(client: GameSocket, gained: number): boolean {
    const before = client.data.level;
    const { level, exp } = applyExpGain({ level: client.data.level, exp: client.data.exp }, gained);
    const levelsGained = level - before;
    client.data.level = level;
    client.data.exp = exp;

    if (levelsGained > 0) {
      client.data.strength += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.intelligence += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.wisdom += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.dexterity += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.constitution += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.maxHp += LEVEL_UP_VITAL_BONUS * levelsGained;
      client.data.maxMana += LEVEL_UP_VITAL_BONUS * levelsGained;
      client.data.maxMovement += LEVEL_UP_VITAL_BONUS * levelsGained;
      client.data.hp = client.data.maxHp;
      client.data.mana = client.data.maxMana;
      client.data.movement = client.data.maxMovement;
    }

    this.worldManager.updateState(client.data.username, {
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      movement: client.data.movement,
      maxMovement: client.data.maxMovement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
    });

    // A level-up changes attributes/max-vitals beyond what the 'combat'
    // event's attacker* fields carry — a fresh, fully authoritative sync
    // keeps the character sheet (and everything else) correct without
    // waiting for a reconnect.
    if (levelsGained > 0) {
      client.emit('sync', { player: this.snapshotFor(client) });
    }
    return levelsGained > 0;
  }

  // A small chance per punch thrown (hit or miss doesn't matter here,
  // there's no miss chance at all in this project) to grow the punch
  // skill by 1 point, same shape as the text game's own skill growth.
  private growPunchSkill(client: GameSocket): void {
    const current = client.data.skills[PUNCH_SKILL] ?? STARTING_SKILL_PERCENT;
    if (current >= MAX_SKILL_PERCENT || Math.random() >= SKILL_GROWTH_CHANCE) return;
    client.data.skills = { ...client.data.skills, [PUNCH_SKILL]: current + 1 };
    this.worldManager.updateState(client.data.username, { skills: client.data.skills });
  }

  async handleConnection(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.set(client.id, new CommandRateLimiter(this.commandLimiterOptions));
    this.activeConnections.setActiveSocket(username, client.id);

    let doc = null;
    try {
      doc = await this.playersService.findByUsername(username);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    const startingMap = getMap(STARTING_MAP);
    client.data.race = doc?.race ?? 'goblin';
    client.data.map = doc?.map ?? STARTING_MAP;
    client.data.row = doc?.row ?? Math.floor(startingMap.rows / 2);
    client.data.col = doc?.col ?? Math.floor(startingMap.cols / 2);
    client.data.level = doc?.level ?? STARTING_LEVEL;
    client.data.exp = doc?.exp ?? STARTING_EXP;
    client.data.strength = doc?.strength ?? STARTING_ATTRIBUTE;
    client.data.intelligence = doc?.intelligence ?? STARTING_ATTRIBUTE;
    client.data.wisdom = doc?.wisdom ?? STARTING_ATTRIBUTE;
    client.data.dexterity = doc?.dexterity ?? STARTING_ATTRIBUTE;
    client.data.constitution = doc?.constitution ?? STARTING_ATTRIBUTE;
    client.data.hp = doc?.hp ?? STARTING_VITAL;
    client.data.maxHp = doc?.maxHp ?? STARTING_VITAL;
    client.data.mana = doc?.mana ?? STARTING_VITAL;
    client.data.maxMana = doc?.maxMana ?? STARTING_VITAL;
    client.data.movement = doc?.movement ?? STARTING_VITAL;
    client.data.maxMovement = doc?.maxMovement ?? STARTING_VITAL;
    client.data.skills = doc?.skills ?? { [PUNCH_SKILL]: STARTING_SKILL_PERCENT };
    client.data.inventory = doc?.inventory ?? [];

    this.worldManager.addPlayer(username, {
      race: client.data.race,
      mapName: client.data.map,
      row: client.data.row,
      col: client.data.col,
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      movement: client.data.movement,
      maxMovement: client.data.maxMovement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      skills: client.data.skills,
      inventory: client.data.inventory,
    });
    void client.join(client.data.map);

    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const { username, map } = client.data;
    this.commandLimiters.delete(client.id);
    this.activeConnections.clearActiveSocketIfCurrent(username, client.id);

    if (this.worldManager.getLocation(username)) {
      await this.persistPosition(client);
    }
    this.worldManager.removePlayer(username);

    if (map) {
      this.server.to(map).emit('map:state', this.worldManager.getMapState(map));
    }
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() rawDirection: unknown
  ): Promise<{ ok: boolean; player: PlayerSnapshot; message?: string }> {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) {
      return { ok: false, player: this.snapshotFor(client), message: 'Slow down — too many moves.' };
    }

    const parsed = directionSchema.safeParse(rawDirection);
    if (!parsed.success) {
      return { ok: false, player: this.snapshotFor(client), message: 'Unknown direction.' };
    }

    const { username } = client.data;
    const result = this.worldManager.processMove(username, parsed.data);
    if (!result) {
      return { ok: false, player: this.snapshotFor(client), message: 'Your session was lost. Please reconnect.' };
    }

    if (!result.ok) {
      return { ok: false, player: this.snapshotFor(client), message: "You can't go that way." };
    }

    const previousMap = client.data.map;
    client.data.map = result.mapName;
    client.data.row = result.row;
    client.data.col = result.col;

    void this.persistPosition(client);

    if (result.transitioned) {
      void client.leave(previousMap);
      void client.join(result.mapName);
      this.server.to(previousMap).emit('map:state', this.worldManager.getMapState(previousMap));
    }
    this.server.to(result.mapName).emit('map:state', this.worldManager.getMapState(result.mapName));

    const message = result.transitioned ? `You enter ${result.mapName}.` : undefined;
    return { ok: true, player: this.snapshotFor(client), message };
  }

  // A right-click punch always plays its swing animation (broadcast via
  // the 'punch' event below) — but it only actually deals damage if an
  // NPC/monster/other player is standing exactly one tile ahead, in the
  // direction thrown ("basically touching" contact range). Whoever's
  // ahead (there can only ever be one occupant per tile — see
  // WorldManagerService's collision) takes the hit; a 'combat' event
  // carries the result to everyone sharing the map.
  @SubscribeMessage('punch')
  async handlePunch(@ConnectedSocket() client: GameSocket, @MessageBody() rawDirection: unknown): Promise<void> {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) return;

    const parsed = directionSchema.safeParse(rawDirection);
    if (!parsed.success) return;
    const direction: Direction = parsed.data;

    this.server.to(client.data.map).emit('punch', { username: client.data.username, direction });

    const delta = DIRECTION_DELTAS[direction];
    const mapName = client.data.map;
    const targetRow = client.data.row + delta.dr;
    const targetCol = client.data.col + delta.dc;

    const monster = this.monsterManager.findMonsterAt(mapName, targetRow, targetCol);
    if (monster) {
      this.resolveMonsterHit(client, monster.id);
      return;
    }

    const npc = NPCS.find((n) => n.map === mapName && n.row === targetRow && n.col === targetCol);
    if (npc) {
      this.resolveNpcHit(client, npc);
      return;
    }

    const targetUsername = this.worldManager.findPlayerAt(mapName, targetRow, targetCol, client.data.username);
    if (targetUsername) {
      await this.resolvePlayerHit(client, targetUsername);
    }
  }

  private resolveMonsterHit(client: GameSocket, monsterId: string): void {
    const monster = this.monsterManager.getMonster(monsterId);
    if (!monster) return;

    const punchSkillPercent = client.data.skills[PUNCH_SKILL] ?? STARTING_SKILL_PERCENT;
    const damage = punchDamage(this.attackerStatsFor(client), monster, punchSkillPercent);
    const result = this.monsterManager.applyDamage(monster.id, damage);
    if (!result) return;
    const { died } = result;

    let expGained: number | undefined;
    let leveledUp = false;
    if (died) {
      expGained = expGainFor(monster.expReward, client.data.level, monster.level);
      leveledUp = this.grantExp(client, expGained);
      this.corpseManager.spawn(monster.kind, monster.mapName, monster.row, monster.col);
    }
    this.growPunchSkill(client);
    void this.persistStats(client);

    const message = died
      ? `${client.data.username} punches the ${monster.kind} for ${damage} damage, defeating it! (+${expGained} exp)`
      : `${client.data.username} punches the ${monster.kind} for ${damage} damage.`;

    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage,
      targetHp: result.monster.hp,
      targetMaxHp: monster.maxHp,
      targetDied: died,
      expGained,
      leveledUp,
      message,
    });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  private resolveNpcHit(client: GameSocket, npc: (typeof NPCS)[number]): void {
    // The training dummy has the same starting attributes as a brand-new
    // player (see combat/formulas.ts) — it's "a player as well" for
    // damage-formula purposes. It grants no exp, though: it instantly
    // resets to full hp on defeat rather than respawning elsewhere, so
    // treating a "kill" as a real player kill would make it an infinite,
    // risk-free exp farm — it's a practice target, not a real fight.
    const defenderStats: CombatantStats = {
      level: npc.level,
      strength: STARTING_ATTRIBUTE,
      intelligence: STARTING_ATTRIBUTE,
      wisdom: STARTING_ATTRIBUTE,
      dexterity: STARTING_ATTRIBUTE,
      constitution: STARTING_ATTRIBUTE,
    };
    const punchSkillPercent = client.data.skills[PUNCH_SKILL] ?? STARTING_SKILL_PERCENT;
    const damage = punchDamage(this.attackerStatsFor(client), defenderStats, punchSkillPercent);
    npc.hp = Math.max(0, npc.hp - damage);
    const died = npc.hp <= 0;

    if (died) npc.hp = npc.maxHp;
    this.growPunchSkill(client);
    void this.persistStats(client);

    const message = died
      ? `${client.data.username} punches the training dummy for ${damage} damage, defeating it! It resets.`
      : `${client.data.username} punches the training dummy for ${damage} damage.`;

    this.emitCombat(client, {
      targetKind: 'npc',
      target: npc.id,
      targetLabel: 'training dummy',
      damage,
      targetHp: npc.hp,
      targetMaxHp: npc.maxHp,
      targetDied: died,
      message,
    });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  private async resolvePlayerHit(client: GameSocket, targetUsername: string): Promise<void> {
    const targetSocketId = this.activeConnections.getActiveSocketId(targetUsername);
    const targetClient = targetSocketId ? (this.server.sockets.sockets.get(targetSocketId) as GameSocket | undefined) : undefined;
    // Extremely rare (disconnected between the occupancy check and here) —
    // just no-op rather than crashing on a stats lookup that no longer exists.
    if (!targetClient) return;

    const defenderStats = this.attackerStatsFor(targetClient);
    const punchSkillPercent = client.data.skills[PUNCH_SKILL] ?? STARTING_SKILL_PERCENT;
    const damage = punchDamage(this.attackerStatsFor(client), defenderStats, punchSkillPercent);
    targetClient.data.hp = Math.max(0, targetClient.data.hp - damage);
    const died = targetClient.data.hp <= 0;

    let expGained: number | undefined;
    let leveledUp = false;

    if (died) {
      expGained = expGainFor(PLAYER_KILL_EXP_REWARD, client.data.level, targetClient.data.level);
      leveledUp = this.grantExp(client, expGained);
      this.corpseManager.spawn(targetClient.data.race, targetClient.data.map, targetClient.data.row, targetClient.data.col);

      const previousMap = targetClient.data.map;
      const startingMap = getMap(STARTING_MAP);
      targetClient.data.map = STARTING_MAP;
      targetClient.data.row = Math.floor(startingMap.rows / 2);
      targetClient.data.col = Math.floor(startingMap.cols / 2);
      targetClient.data.hp = targetClient.data.maxHp;

      this.worldManager.updateState(targetUsername, {
        mapName: targetClient.data.map,
        row: targetClient.data.row,
        col: targetClient.data.col,
        hp: targetClient.data.hp,
      });

      if (previousMap !== targetClient.data.map) {
        void targetClient.leave(previousMap);
        void targetClient.join(targetClient.data.map);
      }
      targetClient.emit('sync', { player: this.snapshotFor(targetClient) });
    } else {
      this.worldManager.updateState(targetUsername, { hp: targetClient.data.hp });
    }

    this.growPunchSkill(client);
    void this.persistStats(client);
    void this.persistPosition(targetClient);
    void this.persistStats(targetClient);

    const message = died
      ? `${client.data.username} punches ${targetUsername} for ${damage} damage, defeating them! (+${expGained} exp)`
      : `${client.data.username} punches ${targetUsername} for ${damage} damage.`;

    this.emitCombat(client, {
      targetKind: 'player',
      target: targetUsername,
      targetLabel: targetUsername,
      damage,
      targetHp: targetClient.data.hp,
      targetMaxHp: targetClient.data.maxHp,
      targetDied: died,
      expGained,
      leveledUp,
      message,
    });

    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
    if (died) {
      this.server.to(targetClient.data.map).emit('map:state', this.worldManager.getMapState(targetClient.data.map));
    }
  }

  private emitCombat(
    client: GameSocket,
    rest: Omit<CombatEventPayload, 'attacker' | 'attackerLevel' | 'attackerExp' | 'attackerHp' | 'attackerMaxHp'>
  ): void {
    this.server.to(client.data.map).emit('combat', {
      attacker: client.data.username,
      attackerLevel: client.data.level,
      attackerExp: client.data.exp,
      attackerHp: client.data.hp,
      attackerMaxHp: client.data.maxHp,
      ...rest,
    });
  }

  // Looting just requires being at or next to the corpse (same tile or
  // one step away in any direction, diagonals included) — corpses don't
  // block movement, so "walk up and click it" is the common case, but a
  // player standing adjacent can also reach for it.
  @SubscribeMessage('loot')
  handleLoot(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() corpseId: unknown
  ): { ok: boolean; inventory?: string[]; message?: string } {
    if (typeof corpseId !== 'string') {
      return { ok: false, message: 'Invalid corpse.' };
    }

    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That's already gone." };
    }

    const withinReach =
      Math.abs(corpse.row - client.data.row) <= 1 && Math.abs(corpse.col - client.data.col) <= 1;
    if (!withinReach) {
      return { ok: false, message: "You're too far away to reach that." };
    }

    this.corpseManager.remove(corpseId);
    client.data.inventory = [...client.data.inventory, corpse.itemLabel];
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));

    return { ok: true, inventory: client.data.inventory };
  }
}
