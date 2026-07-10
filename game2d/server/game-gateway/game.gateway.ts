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
import { CorpseManagerService, bodyPartLabelFor } from '../worlds/corpse-manager.service.js';
import { MONSTER_SPECIES } from '../monsters/monster.js';
import { NPCS } from '../worlds/npcs.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap } from '../../shared/maps.js';
import { resolveMove } from '../worlds/resolveMove.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { STARTING_MAP, DIRECTIONS } from '../../shared/constants.js';
import {
  type CombatantStats,
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_LEVEL,
  GOBLIN_MAX_LEVEL,
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
  weaponBonusFor,
  EQUIPMENT_SLOT_FOR_ITEM,
  CONSUME_EXP_PER_ITEM,
  startingSkills,
  resistanceGrantForItem,
  RESISTANCE_SKILL_STARTING_PERCENT,
  skillGrowthMessage,
  computeDodgeChance,
  computeParryChance,
  computeShieldBlockChance,
  computeExtraAttackChance,
  enhancedDamageBonus,
  monsterDamageReduction,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  HOBGOBLIN_EVOLUTION_SKILLS,
  HOBGOBLIN_EVOLUTION_CXP,
  HOBGOBLIN_ATTRIBUTE_BONUS,
  HOBGOBLIN_STAT_BONUS,
} from '../combat/formulas.js';
import { MONSTER_ATTACK_DAMAGE } from '../monsters/monster.js';
import type { AppConfig } from '../config/configuration.js';
import type { PlayerSnapshot, GameServer, GameSocket, CombatEventPayload, UseItemAck, RestState } from '../../shared/types.js';
import { TOWN_MAPS } from '../../shared/constants.js';
import type { Direction, MapName, MonsterClass } from '../../shared/constants.js';

const directionSchema = z.enum(DIRECTIONS);
const MONSTER_TICK_INTERVAL_MS = 3000;
// Same shape as the text game's own global stat tick — a randomized
// 30-40s interval (a setTimeout chain, not setInterval, so each firing
// re-rolls its own next delay) heals hp/mana/movement by one shared
// random percent of each stat's own max, the percent range depending on
// restState exactly like the text game's own HEAL_PERCENT_RANGE.
const HOURS_PER_DAY = 24;
const STAT_TICK_MIN_MS = 30_000;
const STAT_TICK_MAX_MS = 40_000;
const HEAL_PERCENT_RANGE: Record<RestState, [number, number]> = {
  awake: [2, 5],
  resting: [4, 7],
  sleeping: [5, 10],
};
const STAT_TICK_FLAVOR: Record<RestState, string> = {
  awake: 'You catch your breath',
  resting: 'You rest quietly',
  sleeping: 'You stir in your sleep',
};
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
  // A shared world clock, advanced by 1 hour on the same tick as the
  // global stat-tick heal — resets to midnight on server restart, same
  // tradeoff as the text game's own worldHour. Broadcast to every
  // connected socket regardless of map (see globalStatTick) so the
  // client can render a gradually shifting day/night overlay.
  private worldHour = 0;
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
      const expiredCorpseMaps = this.corpseManager.removeExpired();
      const mapsToBroadcast = new Set<MapName>([...ACTIVE_MONSTER_MAPS, ...expiredCorpseMaps]);
      for (const mapName of mapsToBroadcast) {
        this.server.to(mapName).emit('map:state', this.worldManager.getMapState(mapName));
      }
    }, MONSTER_TICK_INTERVAL_MS);

    this.scheduleStatTick();

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

  private scheduleStatTick(): void {
    const delay = STAT_TICK_MIN_MS + Math.random() * (STAT_TICK_MAX_MS - STAT_TICK_MIN_MS);
    setTimeout(() => this.globalStatTick(), delay).unref();
  }

  private globalStatTick(): void {
    this.worldHour = (this.worldHour + 1) % HOURS_PER_DAY;
    this.server.emit('worldTime', { hour: this.worldHour });
    for (const socket of this.server.sockets.sockets.values()) {
      this.applyStatTick(socket as GameSocket);
    }
    this.scheduleStatTick();
  }

  // One shared random percent (of each stat's own max) heals hp, mana,
  // and movement together — the percent range depends on restState, same
  // shape as the text game's own applyStatTick.
  private applyStatTick(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;

    const [min, max] = HEAL_PERCENT_RANGE[client.data.restState];
    const percent = min + Math.random() * (max - min);
    const healed = (current: number, statMax: number) => Math.min(statMax, current + Math.round((percent / 100) * statMax));

    const hp = healed(client.data.hp, client.data.maxHp);
    const mana = healed(client.data.mana, client.data.maxMana);
    const movement = healed(client.data.movement, client.data.maxMovement);
    if (hp === client.data.hp && mana === client.data.mana && movement === client.data.movement) return;

    client.data.hp = hp;
    client.data.mana = mana;
    client.data.movement = movement;
    this.worldManager.updateState(client.data.username, { hp, mana, movement });
    void this.persistStats(client);
    this.systemMessage(
      client,
      `${STAT_TICK_FLAVOR[client.data.restState]} and recover some hp/mana/movement.`
    );
    client.emit('statTick', {
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      movement: client.data.movement,
      maxMovement: client.data.maxMovement,
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
      equipment: client.data.equipment,
      consumeExp: client.data.consumeExp,
      restState: client.data.restState,
    };
  }

  // Simplified stand-in for the text game's full 8-slot town-guard
  // disguise check — this project only has one equipment slot (weapon),
  // so "properly equipped enough to pass" just means having it filled.
  private canEnterTown(client: GameSocket): boolean {
    return Boolean(client.data.equipment.weapon);
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
        equipment: client.data.equipment,
        consumeExp: client.data.consumeExp,
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
  // OTHER players stay accurate. A goblin already at GOBLIN_MAX_LEVEL
  // gets no exp at all from further kills (matches the text game exactly
  // — the only race with a level cap, since it's the only one with a
  // defined evolution target); a gain that would push a goblin PAST the
  // cap is clamped down to exactly level 10 with exp zeroed, rather than
  // banking the overflow. Returns whether they leveled up and any
  // cap-related flavor message to show.
  private grantExp(client: GameSocket, gained: number): { leveledUp: boolean; message?: string } {
    if (client.data.race === 'goblin' && client.data.level >= GOBLIN_MAX_LEVEL) {
      return {
        leveledUp: false,
        message: `A goblin cannot progress past level ${GOBLIN_MAX_LEVEL} — consume body parts and evolve into a Hobgoblin to grow further.`,
      };
    }

    const before = client.data.level;
    let { level, exp } = applyExpGain({ level: client.data.level, exp: client.data.exp }, gained);
    let cappedMessage: string | undefined;
    if (client.data.race === 'goblin' && level > GOBLIN_MAX_LEVEL) {
      level = GOBLIN_MAX_LEVEL;
      exp = 0;
      cappedMessage = `You have reached the maximum level for a goblin! Consume body parts and evolve into a Hobgoblin to grow further.`;
    }
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
    return { leveledUp: levelsGained > 0, message: cappedMessage };
  }

  // A small chance per attack/defense (hit or miss doesn't matter here,
  // there's no miss chance at all in this project) to grow the given
  // skill by 1 point, same shape as the text game's own skill growth.
  // Returns the notice message if it actually grew.
  private maybeGrowSkill(client: GameSocket, skill: string): string | undefined {
    const current = client.data.skills[skill] ?? STARTING_SKILL_PERCENT;
    if (current >= MAX_SKILL_PERCENT || Math.random() >= SKILL_GROWTH_CHANCE) return undefined;
    const next = current + 1;
    client.data.skills = { ...client.data.skills, [skill]: next };
    this.worldManager.updateState(client.data.username, { skills: client.data.skills });
    return skillGrowthMessage(skill, next);
  }

  // Which skill an attack's own weapon skill-growth chance targets:
  // wielding a dagger grows dagger, bare hands grows punch — you can't
  // possibly get better at punching while wielding a weapon (see the
  // combat-resolution call sites).
  private attackGrowthSkill(client: GameSocket): string {
    const weapon = client.data.equipment.weapon;
    return weapon && weapon.toLowerCase().includes('dagger') ? DAGGER_SKILL : PUNCH_SKILL;
  }

  // Dodge/parry are rolled first (either one fully negates the hit);
  // shield block is only even attempted once both have failed. Growth:
  // dodge/parry only grow when they actually trigger, shield block grows
  // on any attempt (wearing a shield) regardless of outcome — same order
  // and growth rules as the text game's resolveAttackExchange.
  private resolveDefense(
    defenderStats: CombatantStats,
    defenderSkills: Record<string, number>,
    defenderEquipment: Record<string, string>,
    attackerStats: CombatantStats
  ): { avoided: boolean; verb?: string; skill?: string } {
    const dodged = Math.random() < computeDodgeChance(defenderStats, defenderSkills, attackerStats);
    const parried = !dodged && Math.random() < computeParryChance(defenderStats, defenderSkills, defenderEquipment, attackerStats);
    if (dodged || parried) {
      return { avoided: true, verb: dodged ? 'dodge' : 'parry', skill: dodged ? DODGE_SKILL : PARRY_SKILL };
    }

    const blockChance = computeShieldBlockChance(defenderSkills, defenderEquipment);
    const attemptingBlock = blockChance > 0;
    const blocked = attemptingBlock && Math.random() < blockChance;
    return { avoided: blocked, verb: blocked ? 'block' : undefined, skill: attemptingBlock ? SHIELD_BLOCK_SKILL : undefined };
  }

  // Hobgoblin-only: an extra swing (or two — second and third attack roll
  // independently, so a single punch can proc 0, 1, or 2 bonus hits) plus
  // a flat enhanced-damage bonus. All three grow 2% on every attack
  // thrown, hit or miss — same as every other skill in this project.
  private rollHobgoblinExtras(client: GameSocket, growthMessages: string[]): { swings: number; enhancedBonus: number } {
    if (client.data.race !== 'hobgoblin') return { swings: 1, enhancedBonus: 0 };

    let swings = 1;
    if (Math.random() < computeExtraAttackChance(client.data.skills[SECOND_ATTACK_SKILL] ?? 0)) {
      swings++;
      growthMessages.push('Your second attack triggers!');
    }
    const secondGrowth = this.maybeGrowSkill(client, SECOND_ATTACK_SKILL);
    if (secondGrowth) growthMessages.push(secondGrowth);

    if (Math.random() < computeExtraAttackChance(client.data.skills[THIRD_ATTACK_SKILL] ?? 0)) {
      swings++;
      growthMessages.push('Your third attack triggers!');
    }
    const thirdGrowth = this.maybeGrowSkill(client, THIRD_ATTACK_SKILL);
    if (thirdGrowth) growthMessages.push(thirdGrowth);

    const enhancedGrowth = this.maybeGrowSkill(client, ENHANCED_DAMAGE_SKILL);
    if (enhancedGrowth) growthMessages.push(enhancedGrowth);
    const enhancedBonus = enhancedDamageBonus(client.data.skills[ENHANCED_DAMAGE_SKILL] ?? 0);

    return { swings, enhancedBonus };
  }

  // A monster/dummy that survives a punch fights back — a flat punch
  // (or, if it's carrying a weapon, a weapon-style hit; see main.ts's
  // held-weapon overlay for the visual side), subject to the PLAYER's own
  // dodge/parry/shield-block and (for real monsters) resistance skill.
  // Only ever called if the target actually survived the player's own
  // swings; returns the counter-attack's own combat-log line, folded into
  // the same emitCombat call as the player's attack rather than a second
  // broadcast.
  private resolveMonsterCounterAttack(
    client: GameSocket,
    attackerStats: CombatantStats,
    attackerLabel: string,
    monsterClass: MonsterClass | undefined,
    growthMessages: string[]
  ): string {
    const defense = this.resolveDefense(this.attackerStatsFor(client), client.data.skills, client.data.equipment, attackerStats);
    if (defense.skill) {
      const growth = this.maybeGrowSkill(client, defense.skill);
      if (growth) growthMessages.push(growth);
    }
    if (defense.avoided) {
      return defense.verb === 'block'
        ? `You block the ${attackerLabel}'s counter-attack with your shield!`
        : `You ${defense.verb} the ${attackerLabel}'s counter-attack!`;
    }

    const reduction = monsterClass ? monsterDamageReduction(monsterClass, client.data.skills) : 0;
    const damage = Math.max(0, MONSTER_ATTACK_DAMAGE - reduction);
    client.data.hp = Math.max(0, client.data.hp - damage);
    this.worldManager.updateState(client.data.username, { hp: client.data.hp });
    return damage > 0
      ? `The ${attackerLabel} counter-attacks you for ${damage} damage.`
      : `The ${attackerLabel} counter-attacks you, but the blow glances off.`;
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
    client.data.skills = doc?.skills ?? startingSkills();
    client.data.inventory = doc?.inventory ?? [];
    client.data.equipment = doc?.equipment ?? {};
    client.data.consumeExp = doc?.consumeExp ?? 0;
    // Never persisted — a fresh connection always starts awake, same as
    // the text game's own restState.
    client.data.restState = 'awake';

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
      equipment: client.data.equipment,
      consumeExp: client.data.consumeExp,
      restState: client.data.restState,
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

    this.wakeIfNeeded(client);

    const { username } = client.data;

    // Town-entry gate — previewed with the same pure resolveMove the
    // actual move uses (no side effects), so an ungated player is turned
    // away at the gate without ever mutating their cached position.
    const loc = this.worldManager.getLocation(username);
    if (loc) {
      const preview = resolveMove(loc, parsed.data);
      if (preview.ok && preview.transitioned && TOWN_MAPS.includes(preview.mapName) && !this.canEnterTown(client)) {
        return {
          ok: false,
          player: this.snapshotFor(client),
          message: `The guards of ${preview.mapName} bar your way — you need a weapon equipped to pass.`,
        };
      }
    }

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

    this.wakeIfNeeded(client);

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

    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const weaponBonus = weaponBonusFor(client.data.equipment, client.data.skills);
    const growthMessages: string[] = [];
    const { swings, enhancedBonus } = this.rollHobgoblinExtras(client, growthMessages);

    let totalDamage = 0;
    let died = false;
    let currentHp = monster.hp;
    for (let i = 0; i < swings; i++) {
      const swingDamage = punchDamage(this.attackerStatsFor(client), monster, attackSkillPercent, weaponBonus) + enhancedBonus;
      const result = this.monsterManager.applyDamage(monster.id, swingDamage);
      if (!result) break;
      totalDamage += swingDamage;
      currentHp = result.monster.hp;
      died = result.died;
      if (died) break;
    }

    let expGained: number | undefined;
    let leveledUp = false;
    if (died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      // A capped goblin's message means the nominal reward wasn't (fully)
      // applied — showing "+X exp" would be misleading, so the cap
      // message stands in for it instead.
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      const items = [bodyPartLabelFor(monster.kind), ...monster.carriedItems];
      this.corpseManager.spawn(monster.kind, items, monster.mapName, monster.row, monster.col);
    }
    const attackGrowth = this.maybeGrowSkill(client, attackSkill);
    if (attackGrowth) growthMessages.push(attackGrowth);

    let message = died
      ? `${client.data.username} punches the ${monster.kind} for ${totalDamage} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
      : `${client.data.username} punches the ${monster.kind} for ${totalDamage} damage.`;

    if (!died) {
      const counterMessage = this.resolveMonsterCounterAttack(client, monster, monster.kind, monster.monsterClass, growthMessages);
      message += ` ${counterMessage}`;
    }
    void this.persistStats(client);

    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage: totalDamage,
      targetHp: currentHp,
      targetMaxHp: monster.maxHp,
      targetDied: died,
      expGained,
      leveledUp,
      message,
      growthMessages,
    });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  // Anywhere on a map that isn't a wall/exit tile and isn't already
  // occupied by a player, monster, or another NPC — used to relocate the
  // training dummy after it "dies" (see resolveNpcHit) instead of just
  // resetting it in place.
  private randomFreeTileFor(mapName: MapName): { row: number; col: number } {
    const map = getMap(mapName);
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = Math.floor(Math.random() * map.cols);
      if (map.exits.some((e) => e.row === row && e.col === col)) continue;
      if (this.worldManager.isPlayerAt(mapName, row, col)) continue;
      if (this.monsterManager.isOccupied(mapName, row, col)) continue;
      if (NPCS.some((n) => n.map === mapName && n.row === row && n.col === col)) continue;
      return { row, col };
    }
    return { row: Math.floor(map.rows / 2), col: Math.floor(map.cols / 2) };
  }

  private resolveNpcHit(client: GameSocket, npc: (typeof NPCS)[number]): void {
    // The training dummy has the same starting attributes as a brand-new
    // player (see combat/formulas.ts) — it's "a player as well" for
    // damage-formula purposes ("the test player"). It still grants no
    // exp (treating a "kill" as a real player kill would make it an
    // infinite, risk-free exp farm — it's a practice target, not a real
    // fight), but it now leaves an actual (player-kind, so TTL'd) corpse
    // behind — always carrying a bone dagger — and relocates to a random
    // free tile on its map at full hp, rather than instantly resetting in
    // place.
    const defenderStats: CombatantStats = {
      level: npc.level,
      strength: STARTING_ATTRIBUTE,
      intelligence: STARTING_ATTRIBUTE,
      wisdom: STARTING_ATTRIBUTE,
      dexterity: STARTING_ATTRIBUTE,
      constitution: STARTING_ATTRIBUTE,
    };
    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const growthMessages: string[] = [];
    const { swings, enhancedBonus } = this.rollHobgoblinExtras(client, growthMessages);

    // The dummy has no equipment/learned skills of its own to defend with
    // — it can still dodge (a flat, skill-less roll), but never parries
    // or shield-blocks (both require gear it doesn't have).
    let totalDamage = 0;
    let died = false;
    for (let i = 0; i < swings; i++) {
      const swingDamage =
        punchDamage(this.attackerStatsFor(client), defenderStats, attackSkillPercent, weaponBonusFor(client.data.equipment, client.data.skills)) +
        enhancedBonus;
      const defense = this.resolveDefense(defenderStats, {}, {}, this.attackerStatsFor(client));
      if (!defense.avoided) {
        totalDamage += swingDamage;
        npc.hp = Math.max(0, npc.hp - swingDamage);
        died = npc.hp <= 0;
      }
      if (died) break;
    }

    if (died) {
      this.corpseManager.spawn(npc.race, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
      const tile = this.randomFreeTileFor(npc.map);
      npc.row = tile.row;
      npc.col = tile.col;
      npc.hp = npc.maxHp;
    }
    const attackGrowth = this.maybeGrowSkill(client, attackSkill);
    if (attackGrowth) growthMessages.push(attackGrowth);

    let message = died
      ? `${client.data.username} punches the training dummy for ${totalDamage} damage, defeating it! It leaves a corpse and reappears elsewhere.`
      : `${client.data.username} punches the training dummy for ${totalDamage} damage.`;

    if (!died) {
      const counterMessage = this.resolveMonsterCounterAttack(client, defenderStats, 'training dummy', undefined, growthMessages);
      message += ` ${counterMessage}`;
    }
    void this.persistStats(client);

    this.emitCombat(client, {
      targetKind: 'npc',
      target: npc.id,
      targetLabel: 'training dummy',
      damage: totalDamage,
      targetHp: npc.hp,
      targetMaxHp: npc.maxHp,
      targetDied: died,
      message,
      growthMessages,
    });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  private async resolvePlayerHit(client: GameSocket, targetUsername: string): Promise<void> {
    const targetSocketId = this.activeConnections.getActiveSocketId(targetUsername);
    const targetClient = targetSocketId ? (this.server.sockets.sockets.get(targetSocketId) as GameSocket | undefined) : undefined;
    // Extremely rare (disconnected between the occupancy check and here) —
    // just no-op rather than crashing on a stats lookup that no longer exists.
    if (!targetClient) return;

    // Being attacked always wakes/stands a sleeping or resting player up
    // — same as the attacker's own wakeIfNeeded on move/punch, but here
    // it's the DEFENDER who's forced awake by someone else's action.
    this.wakeIfNeeded(targetClient);

    const defenderStats = this.attackerStatsFor(targetClient);
    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const growthMessages: string[] = [];
    const { swings, enhancedBonus } = this.rollHobgoblinExtras(client, growthMessages);

    let damage = 0;
    let avoidedVerb: string | undefined;
    for (let i = 0; i < swings; i++) {
      const swingDamage =
        punchDamage(this.attackerStatsFor(client), defenderStats, attackSkillPercent, weaponBonusFor(client.data.equipment, client.data.skills)) +
        enhancedBonus;
      const defense = this.resolveDefense(defenderStats, targetClient.data.skills, targetClient.data.equipment, this.attackerStatsFor(client));
      if (defense.skill) {
        const defenseGrowth = this.maybeGrowSkill(targetClient, defense.skill);
        if (defenseGrowth) growthMessages.push(defenseGrowth);
      }
      if (defense.avoided) {
        avoidedVerb = defense.verb;
      } else {
        damage += swingDamage;
      }
      if (targetClient.data.hp - damage <= 0) break;
    }
    // Only worth narrating the dodge/parry/block if EVERY swing was
    // avoided — if at least one landed, the damage number speaks for
    // itself (same simplification as multi-swing monster combat).
    const fullyAvoidedVerb = damage === 0 ? avoidedVerb : undefined;

    targetClient.data.hp = Math.max(0, targetClient.data.hp - damage);
    const died = targetClient.data.hp <= 0;

    let expGained: number | undefined;
    let leveledUp = false;

    if (died) {
      const rawExpGained = expGainFor(PLAYER_KILL_EXP_REWARD, client.data.level, targetClient.data.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      this.corpseManager.spawn(
        targetClient.data.race,
        [bodyPartLabelFor(targetClient.data.race)],
        targetClient.data.map,
        targetClient.data.row,
        targetClient.data.col
      );

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

    const attackGrowth = this.maybeGrowSkill(client, attackSkill);
    if (attackGrowth) growthMessages.push(attackGrowth);
    void this.persistStats(client);
    void this.persistPosition(targetClient);
    void this.persistStats(targetClient);

    const message = fullyAvoidedVerb
      ? `${client.data.username} punches ${targetUsername}, but they ${fullyAvoidedVerb} out of the way!`
      : died
        ? `${client.data.username} punches ${targetUsername} for ${damage} damage, defeating them!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
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
      growthMessages,
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
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach that." };
    }

    this.corpseManager.remove(corpseId);
    client.data.inventory = [...client.data.inventory, ...corpse.items];
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));

    return { ok: true, inventory: client.data.inventory };
  }

  private isWithinLootReach(client: GameSocket, row: number, col: number): boolean {
    return Math.abs(row - client.data.row) <= 1 && Math.abs(col - client.data.col) <= 1;
  }

  // The corpse loot modal's "click one item" path — takes a single item
  // out of a (possibly multi-item) corpse rather than everything at once.
  @SubscribeMessage('lootItem')
  handleLootItem(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: unknown
  ): { ok: boolean; inventory?: string[]; message?: string } {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { corpseId?: unknown }).corpseId !== 'string' ||
      typeof (payload as { itemIndex?: unknown }).itemIndex !== 'number'
    ) {
      return { ok: false, message: 'Invalid request.' };
    }
    const { corpseId, itemIndex } = payload as { corpseId: string; itemIndex: number };

    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That's already gone." };
    }
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach that." };
    }

    const item = this.corpseManager.removeItem(corpseId, itemIndex);
    if (item === undefined) {
      return { ok: false, message: "That's already gone." };
    }

    client.data.inventory = [...client.data.inventory, item];
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));

    return { ok: true, inventory: client.data.inventory };
  }

  // Local (map-scoped) chat — same shape as punch: fire-and-forget,
  // rebroadcast only to the sender's own map room, so someone in the
  // Labyrinth or a town never sees Great Plains chat and vice versa. A
  // message starting with "/" is a command instead (see handleCommand)
  // and is never broadcast — only the issuer sees its response.
  @SubscribeMessage('chat')
  handleChat(@ConnectedSocket() client: GameSocket, @MessageBody() rawMessage: unknown): void {
    if (typeof rawMessage !== 'string') return;
    const trimmed = rawMessage.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      this.handleCommand(client, trimmed.slice(1));
      return;
    }

    const message = trimmed.slice(0, 240);
    this.server.to(client.data.map).emit('chat', { username: client.data.username, map: client.data.map, message });
  }

  // A private (sender-only) chat line — reuses the same 'chat' event/log
  // rather than a whole separate channel, since command responses are
  // just "a message only you can see".
  private systemMessage(client: GameSocket, message: string): void {
    client.emit('chat', { username: 'System', map: client.data.map, message });
  }

  private static readonly COMMANDS_HELP_TEXT = [
    'Available commands:',
    '/commands, /help - show this list',
    "/sleep - lie down and close your eyes, recovering hp/mana/movement faster until you wake up (moving or attacking wakes you)",
    '/rest, /sit - sit down to rest, recovering a bit faster than standing around',
    '/wake, /stand - get up from sleeping or resting',
  ].join('\n');

  private handleCommand(client: GameSocket, commandText: string): void {
    const [rawCommand] = commandText.trim().split(/\s+/);
    const command = (rawCommand ?? '').toLowerCase();

    switch (command) {
      case 'commands':
      case 'help':
        this.systemMessage(client, GameGateway.COMMANDS_HELP_TEXT);
        break;
      case 'sleep':
        this.handleSleepCommand(client);
        break;
      case 'rest':
      case 'sit':
        this.handleRestCommand(client);
        break;
      case 'wake':
      case 'stand':
        this.handleWakeCommand(client);
        break;
      default:
        this.systemMessage(client, `Unknown command: /${command}. Try /commands.`);
    }
  }

  // Toggles sleeping <-> awake, same messages as the text game. Never
  // persisted (see handleConnection) — restState always resets to awake
  // on a fresh connection.
  private handleSleepCommand(client: GameSocket): void {
    if (client.data.restState === 'sleeping') {
      this.setRestState(client, 'awake');
      this.systemMessage(client, 'You wake up.');
    } else {
      this.setRestState(client, 'sleeping');
      this.systemMessage(client, "You lie down and drift off to sleep. You won't see anything until you wake up.");
    }
  }

  // Toggles resting <-> awake ("sit" is just an alias, same as the text
  // game — there's no separate sit state).
  private handleRestCommand(client: GameSocket): void {
    if (client.data.restState === 'resting') {
      this.setRestState(client, 'awake');
      this.systemMessage(client, 'You stand up.');
    } else {
      this.setRestState(client, 'resting');
      this.systemMessage(client, 'You sit down to rest.');
    }
  }

  // Explicit, direction-agnostic — always forces awake regardless of
  // prior state.
  private handleWakeCommand(client: GameSocket): void {
    const was = client.data.restState;
    if (was === 'awake') {
      this.systemMessage(client, 'You are already up and about.');
      return;
    }
    this.setRestState(client, 'awake');
    this.systemMessage(client, was === 'sleeping' ? 'You wake up.' : 'You stand up.');
  }

  private setRestState(client: GameSocket, restState: RestState): void {
    client.data.restState = restState;
    this.worldManager.updateState(client.data.username, { restState });
    // The client's own map:state handling filters its own entry out of
    // the players list (see main.ts's applyMapState) — a targeted 'sync'
    // is what actually updates the acting client's own myProfile/sleep
    // overlay, on top of the broadcast every OTHER player in the room
    // needs to see the sleeper's sprite change.
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));
  }

  // Moving or attacking always wakes/stands a player up first (a
  // deliberate departure from the text game, which only wakes on an
  // explicit command — but a screen actually blacked out during a live
  // 2D session needs a way back that isn't "type a slash command blind").
  private wakeIfNeeded(client: GameSocket): void {
    if (client.data.restState === 'awake') return;
    const was = client.data.restState;
    this.setRestState(client, 'awake');
    this.systemMessage(client, was === 'sleeping' ? 'You wake up.' : 'You stand up.');
  }

  // Backs the map modal's "Who" (everyone online) and "Where" (filtered
  // client-side to the asker's own map) tabs.
  @SubscribeMessage('who')
  handleWho(): { players: Array<{ username: string; map: MapName; level: number }> } {
    return { players: this.worldManager.getAllPlayers() };
  }

  // One-way, one-time — reaching HOBGOBLIN_EVOLUTION_CXP consumed body
  // parts as a goblin transforms them into a Hobgoblin: level/exp reset
  // to a fresh level 1, attributes/vitals boosted (and fully healed),
  // consumeExp reset to 0, and any of the Hobgoblin-exclusive skills
  // (second attack/third attack/enhanced damage) they don't already have
  // granted at STARTING_SKILL_PERCENT. Existing skills are left alone.
  private maybeEvolveToHobgoblin(client: GameSocket): string[] {
    if (client.data.race !== 'goblin' || client.data.consumeExp < HOBGOBLIN_EVOLUTION_CXP) return [];

    client.data.race = 'hobgoblin';
    client.data.level = STARTING_LEVEL;
    client.data.exp = STARTING_EXP;
    client.data.consumeExp = 0;

    client.data.strength += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.intelligence += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.wisdom += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.dexterity += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.constitution += HOBGOBLIN_ATTRIBUTE_BONUS;

    client.data.maxHp += HOBGOBLIN_STAT_BONUS;
    client.data.maxMana += HOBGOBLIN_STAT_BONUS;
    client.data.maxMovement += HOBGOBLIN_STAT_BONUS;
    client.data.hp = client.data.maxHp;
    client.data.mana = client.data.maxMana;
    client.data.movement = client.data.maxMovement;

    const newSkills: string[] = [];
    for (const skill of HOBGOBLIN_EVOLUTION_SKILLS) {
      if (client.data.skills[skill] === undefined) {
        client.data.skills = { ...client.data.skills, [skill]: STARTING_SKILL_PERCENT };
        newSkills.push(skill);
      }
    }

    this.worldManager.updateState(client.data.username, {
      race: client.data.race,
      level: client.data.level,
      exp: client.data.exp,
      consumeExp: client.data.consumeExp,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      maxHp: client.data.maxHp,
      maxMana: client.data.maxMana,
      maxMovement: client.data.maxMovement,
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      skills: client.data.skills,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });

    const messages = [
      '**Your body twists and swells with dark power — you have evolved into a Hobgoblin!**',
      'Your level has reset to 1.',
      `Your attributes have increased by ${HOBGOBLIN_ATTRIBUTE_BONUS}.`,
      `Your hp, mana, and movement have increased by ${HOBGOBLIN_STAT_BONUS} and been fully restored.`,
      'Your consumed exp has reset to 0.',
    ];
    if (newSkills.length > 0) {
      messages.push(`You have also learned: ${newSkills.join(', ')} (starting at ${STARTING_SKILL_PERCENT}%).`);
    }
    return messages;
  }

  // Shared by both useItem's "consume" path and the forced consumeItem
  // RPC: grants consumeExp, rolls a resistance skill if this item's name
  // maps to one (see resistanceGrantForItem), and checks for a Hobgoblin
  // evolution. Returns the flavor message lines to show, if any.
  private applyConsume(client: GameSocket, item: string): string[] {
    client.data.consumeExp += CONSUME_EXP_PER_ITEM;

    const messages: string[] = [];
    const grant = resistanceGrantForItem(item);
    if (grant && client.data.skills[grant.skill] === undefined && Math.random() < grant.chance) {
      client.data.skills = { ...client.data.skills, [grant.skill]: RESISTANCE_SKILL_STARTING_PERCENT };
      messages.push(`You have gained ${grant.skill} (${RESISTANCE_SKILL_STARTING_PERCENT}%)!`);
    }
    // Checked after the resistance roll above so a body part that both
    // grants a resistance AND crosses the evolution threshold in the same
    // consume shows both messages, in that order.
    messages.push(...this.maybeEvolveToHobgoblin(client));
    return messages;
  }

  // Persists/broadcasts/builds the ack after either an equip or a
  // consume — both useItem and consumeItem end the same way.
  private finishItemAction(client: GameSocket, inventory: string[], action: 'consumed' | 'equipped', messages: string[]): UseItemAck {
    client.data.inventory = inventory;
    this.worldManager.updateState(client.data.username, {
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      consumeExp: client.data.consumeExp,
      skills: client.data.skills,
    });
    void this.persistStats(client);
    this.server.to(client.data.map).emit('map:state', this.worldManager.getMapState(client.data.map));

    return {
      ok: true,
      action,
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      consumeExp: client.data.consumeExp,
      skills: client.data.skills,
      message: messages.length > 0 ? messages.join('\n') : undefined,
    };
  }

  // Clicking an inventory item: the server alone decides whether it's
  // equippable (see combat/formulas.ts's EQUIPMENT_SLOT_FOR_ITEM) or just
  // a consumable body part. Equipping swaps out whatever was already in
  // that slot (returning it to inventory, mirroring the text game's own
  // "unequip the old one first" behavior); consuming removes it for good
  // and grants a flat CONSUME_EXP_PER_ITEM toward the separate
  // consumeExp counter.
  @SubscribeMessage('useItem')
  handleUseItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): UseItemAck {
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) {
      return { ok: false, message: 'Invalid item.' };
    }

    const item = client.data.inventory[itemIndex];
    if (item === undefined) {
      return { ok: false, message: "You don't have that." };
    }

    const inventory = [...client.data.inventory];
    inventory.splice(itemIndex, 1);

    const slot = EQUIPMENT_SLOT_FOR_ITEM[item];
    if (slot) {
      const previous = client.data.equipment[slot];
      if (previous) inventory.push(previous);
      client.data.equipment = { ...client.data.equipment, [slot]: item };
      return this.finishItemAction(client, inventory, 'equipped', []);
    }

    const messages = this.applyConsume(client, item);
    return this.finishItemAction(client, inventory, 'consumed', messages);
  }

  // Right-clicking an inventory item (see main.ts, which captures the
  // browser's own context-menu event to trigger this instead) always
  // consumes it, even if it's normally equippable (a bone dagger, say) —
  // same as the text game's "eat <item>" letting you consume a weapon
  // for its exp instead of wielding it.
  @SubscribeMessage('consumeItem')
  handleConsumeItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): UseItemAck {
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) {
      return { ok: false, message: 'Invalid item.' };
    }

    const item = client.data.inventory[itemIndex];
    if (item === undefined) {
      return { ok: false, message: "You don't have that." };
    }

    const inventory = [...client.data.inventory];
    inventory.splice(itemIndex, 1);

    const messages = this.applyConsume(client, item);
    return this.finishItemAction(client, inventory, 'consumed', messages);
  }
}
