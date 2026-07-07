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

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { ItemManagerService } from '../items/item-manager.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap } from '../game/maps.js';
import { resolveRoom } from '../game/room.js';
import { resolveMove } from '../game/resolveMove.js';
import { applyExpGain, maxTnlForLevel } from '../players/leveling.js';
import { undeadDamageReduction } from '../players/skills.js';
import { STARTING_MAP } from '../../shared/constants.js';
import { DIRECTION_ALIASES } from '../../shared/directions.js';
import { commandSchema } from './command.schema.js';
import type { AppConfig } from '../config/configuration.js';
import type { Location } from '../game/types.js';
import type { Monster } from '../monsters/monster.js';
import type { Direction } from '../../shared/directions.js';
import type { PlayerSnapshot } from '../../shared/types.js';
import type { GameServer, GameSocket, CommandAck, CombatStatus } from './types.js';

const ATTACK_PREFIX = 'attack ';
const CONSUME_PREFIX = 'consume ';
const PLAYER_ATTACK_DAMAGE = 6;
const SKELETON_ATTACK_DAMAGE = 2;
const ATTACK_INTERVAL_MS = 4000;
const SKILL_GAIN_CHANCE = 0.2;
const ALL_DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];

interface ActiveCombat {
  timer: NodeJS.Timeout;
  targetId: string;
}

// "a leg" vs "an arm" — used for both the dropped-item room message and
// the kill message, since the same body-part pool includes vowel-leading
// names.
function articleFor(word: string, capitalized = false): string {
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return capitalized ? article.charAt(0).toUpperCase() + article.slice(1) : article;
}

// cors/heartbeat are configured centrally in ws-adapter.ts, not here — this
// stays a bare gateway so there's exactly one place that owns those options.
@WebSocketGateway()
export class GameGateway implements OnGatewayInit<GameServer>, OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket> {
  @WebSocketServer()
  private server!: GameServer;

  private readonly commandLimiters = new Map<string, CommandRateLimiter>();
  private readonly commandLimiterOptions: CommandRateLimiterOptions;
  private readonly activeCombats = new Map<string, ActiveCombat>();

  constructor(
    private readonly playersService: PlayersService,
    private readonly worldManager: WorldManagerService,
    private readonly monsterManager: MonsterManagerService,
    private readonly itemManager: ItemManagerService,
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

    // Runs on every handshake, before 'connection' fires: connection-rate
    // limiting, then JWT + Redis session validation. A stale token
    // (expired, or superseded by a newer login elsewhere) is rejected here
    // rather than ever reaching game logic.
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

  async handleConnection(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.set(client.id, new CommandRateLimiter(this.commandLimiterOptions));
    this.activeConnections.setActiveSocket(username, client.id);

    const startingMap = getMap(STARTING_MAP);
    let doc = null;
    try {
      doc = await this.playersService.findByUsername(username);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    const mapName = doc?.map ?? STARTING_MAP;
    const row = doc?.row ?? Math.floor(startingMap.rows / 2);
    const col = doc?.col ?? Math.floor(startingMap.cols / 2);
    // Cached on the socket for the rest of the session — see SocketData.
    client.data.hp = doc?.hp ?? 100;
    client.data.mana = doc?.mana ?? 100;
    client.data.movement = doc?.movement ?? 100;
    client.data.exp = doc?.exp ?? 0;
    client.data.level = doc?.level ?? 1;
    client.data.skills = doc?.skills ?? [];

    await this.worldManager.addPlayer(username, mapName, row, col);

    client.emit('sync', {
      player: this.snapshotFor(client, { mapName, row, col }),
      minimap: this.worldManager.getMinimap(username) ?? [],
      room: resolveRoom({ mapName, row, col }),
      monsterMessage: this.monsterMessageFor({ mapName, row, col }),
      itemMessage: this.itemMessageFor({ mapName, row, col }),
    });
  }

  private snapshotFor(client: GameSocket, loc: Location): PlayerSnapshot {
    return {
      username: client.data.username,
      map: loc.mapName,
      row: loc.row,
      col: loc.col,
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      maxTnl: maxTnlForLevel(client.data.level),
      skills: client.data.skills,
    };
  }

  private monsterMessageFor(loc: Location): string | undefined {
    const monster = this.monsterManager.getMonsterAt(loc.mapName, loc.row, loc.col);
    return monster ? `A ${monster.kind} is here!` : undefined;
  }

  private itemMessageFor(loc: Location): string | undefined {
    const item = this.itemManager.getItemAt(loc.mapName, loc.row, loc.col);
    return item ? `${articleFor(item.name, true)} ${item.name} lies here.` : undefined;
  }

  private hpPercent(monster: Monster): number {
    return Math.max(0, Math.round((monster.hp / monster.maxHp) * 100));
  }

  private clearCombat(clientId: string): void {
    const existing = this.activeCombats.get(clientId);
    if (existing) {
      clearInterval(existing.timer);
      this.activeCombats.delete(clientId);
    }
  }

  // Every cardinal direction that would actually lead somewhere from loc
  // (in-bounds, whether or not it crosses a map exit) — used by "flee" to
  // pick a random escape route. Pure and dependency-free like resolveMove
  // itself, so this is safe to call directly from the gateway even though
  // the player's authoritative position lives in a world instance that may
  // be a separate worker_thread: it only reads the static map registry.
  private fleeableDirections(loc: Location): Direction[] {
    return ALL_DIRECTIONS.filter((direction) => resolveMove(loc, direction).ok);
  }

  // The core "basic hit" exchange, shared by the first (synchronous) hit in
  // handleAttack and every subsequent tick in tickCombat: player swings for
  // a flat 6 damage; if that doesn't kill it, it swings back (reduced by 1
  // if the target is undead and the player has learned resistance to
  // that). Returns one line per event (hit, kill, level-up, drop,
  // counter-hit) so the client can log each separately rather than one
  // concatenated sentence.
  private resolveAttackExchange(client: GameSocket, target: Monster): { messages: string[]; died: boolean } {
    const { kind, expReward } = target;
    const { died } = this.monsterManager.applyDamage(target.id, PLAYER_ATTACK_DAMAGE);

    const messages = [`You hit the ${kind} for ${PLAYER_ATTACK_DAMAGE} damage!`];

    if (died) {
      messages.push(`You killed the ${kind}!`);

      const before = client.data.level;
      const { level, exp } = applyExpGain({ level: client.data.level, exp: client.data.exp }, expReward);
      client.data.level = level;
      client.data.exp = exp;
      if (level > before) {
        messages.push(`You leveled up! You are now level ${level}!`);
      }

      const drop = this.monsterManager.getDeathDrop(target.kind);
      if (drop) {
        this.itemManager.dropItem(drop.name, target.mapName, target.row, target.col, drop.skillReward);
        messages.push(`The ${kind} crumbles, leaving behind ${articleFor(drop.name)} ${drop.name}.`);
      }
    } else {
      const reduction = target.undead ? undeadDamageReduction(client.data.skills) : 0;
      const damage = Math.max(0, SKELETON_ATTACK_DAMAGE - reduction);
      client.data.hp = Math.max(0, client.data.hp - damage);
      messages.push(`The ${kind} hits you for ${damage} damage.`);
    }

    return { messages, died };
  }

  // Fires every ATTACK_INTERVAL_MS while a fight is active for this
  // connection. Pushed via 'combat:update' rather than a command ack,
  // since the player isn't sending anything — this is the server acting on
  // its own timer.
  private tickCombat(client: GameSocket, targetId: string): void {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      this.clearCombat(client.id);
      return;
    }

    const target = this.monsterManager.getMonsterById(targetId);
    if (!target) {
      this.clearCombat(client.id);
      client.emit('combat:update', {
        messages: ['Your target is gone.'],
        player: this.snapshotFor(client, loc),
        monsterMessage: this.monsterMessageFor(loc),
        itemMessage: this.itemMessageFor(loc),
        ended: true,
      });
      return;
    }

    if (target.mapName !== loc.mapName || target.row !== loc.row || target.col !== loc.col) {
      this.clearCombat(client.id);
      client.emit('combat:update', {
        messages: [`The ${target.kind} slips out of reach.`],
        player: this.snapshotFor(client, loc),
        monsterMessage: this.monsterMessageFor(loc),
        itemMessage: this.itemMessageFor(loc),
        ended: true,
      });
      return;
    }

    const { messages, died } = this.resolveAttackExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
    });

    if (died) {
      this.clearCombat(client.id);
      client.emit('combat:update', {
        messages,
        player: this.snapshotFor(client, loc),
        monsterMessage: this.monsterMessageFor(loc),
        itemMessage: this.itemMessageFor(loc),
        ended: true,
      });
      return;
    }

    client.emit('combat:update', {
      messages,
      player: this.snapshotFor(client, loc),
      monster: { monsterName: target.kind, hpPercent: this.hpPercent(target) },
      monsterMessage: this.monsterMessageFor(loc),
      itemMessage: this.itemMessageFor(loc),
      ended: false,
    });
  }

  // Awaited on disconnect (nothing else to do but wait); fire-and-forget
  // after a move (see handleCommand) so a background DB write never adds
  // latency to the command ack. Called in both places so a hard crash
  // between moves loses at most the in-flight write, not the whole session.
  private async persistPosition(username: string, loc: Location): Promise<void> {
    try {
      await this.playersService.updatePosition(username, { map: loc.mapName, row: loc.row, col: loc.col });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player position:', message);
    }
  }

  // Same awaited-on-disconnect / fire-and-forget-after-action split as
  // persistPosition, for the same reason — combat and consuming now
  // mutate hp/exp/level/skills mid-session (see handleAttack, handleConsume).
  private async persistStats(
    username: string,
    stats: { hp: number; exp: number; level: number; skills: string[] }
  ): Promise<void> {
    try {
      await this.playersService.updateStats(username, stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player stats:', message);
    }
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.delete(client.id);
    this.clearCombat(client.id);
    this.activeConnections.clearActiveSocketIfCurrent(username, client.id);

    const loc = this.worldManager.getLocation(username);
    this.worldManager.removePlayer(username);
    if (loc) {
      await this.persistPosition(username, loc);
    }
    await this.persistStats(username, {
      hp: client.data.hp,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
    });
  }

  // Returning a value here becomes the ack the client's emit() callback
  // receives (Nest's built-in behavior for WS handlers with a client-side
  // acknowledgement) — no need to accept/call the raw ack function.
  @SubscribeMessage('command')
  async handleCommand(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() rawText: string
  ): Promise<CommandAck> {
    const { username } = client.data;
    const limiter = this.commandLimiters.get(client.id);

    if (!limiter?.tryConsume()) {
      return { ok: false, messages: ['Slow down — too many commands.'] };
    }

    const parsed = commandSchema.safeParse(rawText);
    if (!parsed.success) {
      return { ok: false, messages: ['Invalid command.'] };
    }
    const text = parsed.data.toLowerCase();

    if (text === 'logout') {
      await this.sessionStore.clearActiveSession(username);
      this.activeConnections.clearActiveSocketIfCurrent(username, client.id);
      // Deferred so the ack (this return value) reaches the client before
      // the connection tears down — the ack is dispatched as a microtask
      // continuation of this handler's promise, which always runs before
      // this setImmediate's macrotask callback.
      setImmediate(() => client.disconnect(true));
      return { ok: true, messages: ['You have logged out.'], loggedOut: true };
    }

    if (text === 'attack' || text.startsWith(ATTACK_PREFIX)) {
      const mobQuery = text === 'attack' ? '' : text.slice(ATTACK_PREFIX.length).trim();
      return this.handleAttack(client, mobQuery);
    }

    if (text === 'flee') {
      return this.handleFlee(client);
    }

    if (text === 'consume' || text.startsWith(CONSUME_PREFIX)) {
      const itemQuery = text === 'consume' ? '' : text.slice(CONSUME_PREFIX.length).trim();
      return this.handleConsume(client, itemQuery);
    }

    if (text === 'skills') {
      return this.handleSkills(client);
    }

    const direction = DIRECTION_ALIASES[text];
    if (!direction) {
      const loc = this.worldManager.getLocation(username);
      const ackPayload: CommandAck = {
        ok: false,
        messages: [`Unknown command: "${rawText}".`],
        minimap: this.worldManager.getMinimap(username),
      };
      if (loc) {
        ackPayload.player = this.snapshotFor(client, loc);
        ackPayload.room = resolveRoom(loc);
        ackPayload.monsterMessage = this.monsterMessageFor(loc);
        ackPayload.itemMessage = this.itemMessageFor(loc);
      }
      return ackPayload;
    }

    // Can't just walk out of a fight — "flee" (above) is the only way out
    // while activeCombats has an entry for this connection.
    if (this.activeCombats.has(client.id)) {
      const loc = this.worldManager.getLocation(username);
      return {
        ok: false,
        messages: ['You\'re in a fight! Type "flee" to escape, or keep attacking.'],
        player: loc ? this.snapshotFor(client, loc) : undefined,
        minimap: this.worldManager.getMinimap(username),
        room: loc ? resolveRoom(loc) : undefined,
        monsterMessage: loc ? this.monsterMessageFor(loc) : undefined,
        itemMessage: loc ? this.itemMessageFor(loc) : undefined,
      };
    }

    const fromMap = this.worldManager.getLocation(username)?.mapName ?? 'the world';
    const result = await this.worldManager.processCommand(username, direction);

    if (!result) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    let message: string;
    if (!result.ok) {
      message = `${username} can't move ${direction} — that's the edge of ${fromMap}.`;
    } else if (result.transitioned) {
      message = `${username} moved ${direction} and left ${result.fromMap} for ${result.mapName}.`;
    } else {
      message = `${username} moved ${direction}.`;
    }

    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    if (result.ok) {
      // Not awaited — a background save shouldn't add latency to the
      // command ack. Also saved on disconnect (persistPosition above), so
      // this is about surviving a hard crash between moves, not the
      // primary persistence path.
      void this.persistPosition(username, loc);
    }

    return {
      ok: result.ok,
      messages: [message],
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(loc),
      itemMessage: this.itemMessageFor(loc),
    };
  }

  // "attack <mob>" starts (or redirects) an auto-attack loop: the player
  // swings immediately (resolved synchronously, in this ack), and if the
  // target survives, a timer takes over and repeats the same exchange
  // every ATTACK_INTERVAL_MS via tickCombat until it dies, wanders out of
  // reach, or the player flees.
  private async handleAttack(client: GameSocket, mobQuery: string): Promise<CommandAck> {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    const buildAck = (messages: string[], ok: boolean, combat?: CombatStatus | null): CommandAck => ({
      ok,
      messages,
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(loc),
      itemMessage: this.itemMessageFor(loc),
      combat,
    });

    if (!mobQuery) {
      return buildAck(['Attack what?'], false);
    }

    const target = this.monsterManager.findMonsterByNameAt(loc.mapName, loc.row, loc.col, mobQuery);
    if (!target) {
      return buildAck([`There is no "${mobQuery}" here to attack.`], false);
    }

    // Already fighting this exact target — report status without landing
    // an extra hit or resetting the 4-second cadence.
    const existing = this.activeCombats.get(client.id);
    if (existing && existing.targetId === target.id) {
      return buildAck([`You are already attacking the ${target.kind}.`], true, {
        monsterName: target.kind,
        hpPercent: this.hpPercent(target),
      });
    }

    // Redirecting to a new target cancels whatever fight was running.
    this.clearCombat(client.id);

    const { messages, died } = this.resolveAttackExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
    });

    if (died) {
      return buildAck(messages, true, null);
    }

    const targetId = target.id;
    const timer = setInterval(() => this.tickCombat(client, targetId), ATTACK_INTERVAL_MS);
    timer.unref();
    this.activeCombats.set(client.id, { timer, targetId });

    return buildAck(messages, true, { monsterName: target.kind, hpPercent: this.hpPercent(target) });
  }

  // The only way out of a fight: ends it immediately (combat: null — see
  // CommandAck) and moves the player one step in a random direction that
  // actually leads somewhere, same underlying move pipeline as ordinary
  // movement (so it can cross a map exit same as a normal step would).
  private async handleFlee(client: GameSocket): Promise<CommandAck> {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    if (!this.activeCombats.has(client.id)) {
      return {
        ok: false,
        messages: ["You aren't in a fight to flee from."],
        player: this.snapshotFor(client, loc),
        minimap: this.worldManager.getMinimap(username),
        room: resolveRoom(loc),
        monsterMessage: this.monsterMessageFor(loc),
        itemMessage: this.itemMessageFor(loc),
      };
    }

    this.clearCombat(client.id);

    const options = this.fleeableDirections(loc);
    const direction = options[Math.floor(Math.random() * options.length)];
    if (!direction) {
      // No adjacent cell to flee into (boxed in on every side) — the fight
      // still ends, the player just stays put.
      return {
        ok: true,
        messages: ['You break off the fight, but there is nowhere to flee!'],
        player: this.snapshotFor(client, loc),
        minimap: this.worldManager.getMinimap(username),
        room: resolveRoom(loc),
        monsterMessage: this.monsterMessageFor(loc),
        itemMessage: this.itemMessageFor(loc),
        combat: null,
      };
    }

    const result = await this.worldManager.processCommand(username, direction);
    const newLoc = this.worldManager.getLocation(username);
    if (!result || !newLoc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    // fleeableDirections already checked this direction is valid from loc,
    // so result.ok should always be true here — this guard is just
    // defense in depth in case position state changed underneath us.
    if (result.ok) {
      void this.persistPosition(username, newLoc);
    }

    const message = !result.ok
      ? 'You break off the fight, but stumble and stay put!'
      : result.transitioned
        ? `You flee ${direction} and stumble out of ${result.fromMap} into ${result.mapName}!`
        : `You flee ${direction}!`;

    return {
      ok: true,
      messages: [message],
      player: this.snapshotFor(client, newLoc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(newLoc),
      monsterMessage: this.monsterMessageFor(newLoc),
      itemMessage: this.itemMessageFor(newLoc),
      combat: null,
    };
  }

  // "consume <item>" — partial, case-insensitive match against a dropped
  // item's name in the player's current room. Always removes the item once
  // found, regardless of outcome. If the item teaches a skill the player
  // doesn't already have, there's a SKILL_GAIN_CHANCE chance of learning it.
  private async handleConsume(client: GameSocket, itemQuery: string): Promise<CommandAck> {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    const buildAck = (messages: string[], ok: boolean): CommandAck => ({
      ok,
      messages,
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(loc),
      itemMessage: this.itemMessageFor(loc),
    });

    if (!itemQuery) {
      return buildAck(['Consume what?'], false);
    }

    const item = this.itemManager.findItemByNameAt(loc.mapName, loc.row, loc.col, itemQuery);
    if (!item) {
      return buildAck([`There is no "${itemQuery}" here to consume.`], false);
    }

    this.itemManager.removeItem(item.id);

    if (!item.skillReward) {
      return buildAck([`You consume the ${item.name}.`], true);
    }

    if (client.data.skills.includes(item.skillReward)) {
      return buildAck([`You consume the ${item.name}, but you already know this secret.`], true);
    }

    if (Math.random() >= SKILL_GAIN_CHANCE) {
      return buildAck([`You consume the ${item.name}, but feel nothing happen.`], true);
    }

    client.data.skills = [...client.data.skills, item.skillReward];
    void this.persistStats(username, {
      hp: client.data.hp,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
    });

    return buildAck([`You consume the ${item.name}.`, `You have gained ${item.skillReward}!`], true);
  }

  // Purely informational — no state change, so unlike every other handler
  // here this doesn't need to be async.
  private handleSkills(client: GameSocket): CommandAck {
    const { username, skills } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = skills.length > 0 ? [`Your skills: ${skills.join(', ')}.`] : ["You haven't learned any skills yet."];

    return {
      ok: true,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(loc) : undefined,
    };
  }
}
