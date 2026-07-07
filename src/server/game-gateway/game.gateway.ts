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
import type { OnModuleDestroy } from '@nestjs/common';

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import type { MonsterMoveEvent } from '../monsters/monster-manager.service.js';
import { ItemManagerService } from '../items/item-manager.service.js';
import { skillForItemName } from '../items/item-definitions.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap, getWorldOverview } from '../game/maps.js';
import { resolveRoom, getRoomName } from '../game/room.js';
import { resolveMove, resolveFullMapGrid } from '../game/resolveMove.js';
import { applyExpGain, maxTnlForLevel } from '../players/leveling.js';
import { undeadDamageReduction } from '../players/skills.js';
import { STARTING_MAP } from '../../shared/constants.js';
import type { MapName } from '../../shared/constants.js';
import { DIRECTION_ALIASES, DIRECTION_DELTAS } from '../../shared/directions.js';
import { commandSchema } from './command.schema.js';
import type { AppConfig } from '../config/configuration.js';
import type { Location } from '../game/types.js';
import type { Monster } from '../monsters/monster.js';
import type { Direction } from '../../shared/directions.js';
import type { PlayerSnapshot } from '../../shared/types.js';
import type { GameServer, GameSocket, CommandAck } from './types.js';

const PLAYER_ATTACK_DAMAGE = 6;
const SKELETON_ATTACK_DAMAGE = 2;
const ATTACK_INTERVAL_MS = 4000;
const ALL_DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];
// hp/mana/movement all cap at this same value.
const MAX_STAT = 100;

// "attack"/"kill" can both be partially typed ("att", "ki", ...). A
// minimum length keeps a bare single letter from being swallowed here
// instead of falling through to movement — "a" must stay west, not become
// a 1-letter prefix of "attack". "kill" gets a further single-letter
// shorthand ("k") on top of that, since nothing else claims that letter.
const ATTACK_VERBS = ['attack', 'kill'];
const ATTACK_VERB_MIN_LENGTH = 2;
const KILL_SHORTHAND = 'k';

// "inventory" can be partially typed too ("inv", "invent", ...), but as a
// bare command (it takes no argument) — same minimum-length reasoning.
const INVENTORY_MIN_LENGTH = 2;

// "con" only ever prefixes "consume" ("com" is "commands"), so 3 is the
// minimum that avoids that collision (2 chars, "co", would be ambiguous).
const CONSUME_MIN_LENGTH = 3;

// "scan" and "score" share the 2-letter prefix "sc". "sca"/"scan" only
// ever prefixes scan (score's 3rd letter is "o", not "a"), so scan keeps
// requiring 3 — but "sc" itself is explicitly claimed by score, so score's
// minimum can drop to 2 as long as scan's stricter check runs first in the
// dispatch order.
const SCAN_MIN_LENGTH = 3;
const SCORE_MIN_LENGTH = 2;

// "whe"/"wher"/"where" — 3 is the natural floor since "w" alone must stay
// reserved for west movement.
const WHERE_MIN_LENGTH = 3;

// "sle"/"slee"/"sleep" — nothing else starts with "sl", so 3 is just the
// example floor from the request, not a disambiguation requirement.
const SLEEP_MIN_LENGTH = 3;

// "re"/"res"/"rest" — nothing else starts with "re", so 2 is just the
// example floor from the request, not a disambiguation requirement. "sit"
// has no partial-match variants requested, so it's checked as a literal
// alias alongside "rest" rather than through matchesPartial.
const REST_MIN_LENGTH = 2;

// The stat tick's interval is itself randomized (not a fixed
// setInterval) — each firing schedules the next one at a fresh random
// delay in this range. It always runs for every connection, regardless of
// restState; only the heal percentage range (below) depends on state.
const STAT_TICK_MIN_MS = 20_000;
const STAT_TICK_MAX_MS = 30_000;

// Heal percentage range per restState, applied identically to
// hp/mana/movement each tick (one random roll shared across all three).
const HEAL_PERCENT_RANGE: Record<GameSocket['data']['restState'], [number, number]> = {
  awake: [2, 5],
  resting: [4, 7],
  sleeping: [5, 10],
};

function matchesPartial(text: string, word: string, minLength: number): boolean {
  return text.length >= minLength && word.startsWith(text);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

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

function isAttackVerb(word: string): boolean {
  if (word === KILL_SHORTHAND) return true;
  return word.length >= ATTACK_VERB_MIN_LENGTH && ATTACK_VERBS.some((verb) => verb.startsWith(word));
}

// cors/heartbeat are configured centrally in ws-adapter.ts, not here — this
// stays a bare gateway so there's exactly one place that owns those options.
@WebSocketGateway()
export class GameGateway
  implements OnGatewayInit<GameServer>, OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket>, OnModuleDestroy
{
  @WebSocketServer()
  private server!: GameServer;

  private readonly commandLimiters = new Map<string, CommandRateLimiter>();
  private readonly commandLimiterOptions: CommandRateLimiterOptions;
  private readonly activeCombats = new Map<string, ActiveCombat>();
  // One shared timer for every connection, not one per socket — see
  // scheduleGlobalStatTick — so every player is on the same tick, rather
  // than each running their own independent randomized cycle.
  private globalStatTickTimer?: NodeJS.Timeout;

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

    // Monsters wander on their own timer (MonsterManagerService.wanderAll),
    // independent of any command — this is the only way a connected player
    // finds out one just left or arrived in their room between commands.
    this.monsterManager.on('moved', (event: MonsterMoveEvent) => this.handleMonsterMoved(event));

    // One global tick for every connected player — see scheduleGlobalStatTick.
    this.scheduleGlobalStatTick();

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

  onModuleDestroy(): void {
    if (this.globalStatTickTimer) clearTimeout(this.globalStatTickTimer);
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
    client.data.race = doc?.race ?? 'goblin';
    client.data.hp = doc?.hp ?? 100;
    client.data.mana = doc?.mana ?? 100;
    client.data.movement = doc?.movement ?? 100;
    client.data.exp = doc?.exp ?? 0;
    client.data.level = doc?.level ?? 1;
    client.data.skills = doc?.skills ?? [];
    client.data.inventory = doc?.inventory ?? [];
    client.data.consumeExp = doc?.consumeExp ?? 0;
    // Never persisted — a fresh connection always starts awake.
    client.data.restState = 'awake';

    await this.worldManager.addPlayer(username, mapName, row, col);

    client.emit('sync', {
      player: this.snapshotFor(client, { mapName, row, col }),
      minimap: this.worldManager.getMinimap(username) ?? [],
      room: resolveRoom({ mapName, row, col }),
      monsterMessage: this.monsterMessageFor(client, { mapName, row, col }),
      itemMessage: this.itemMessageFor(client, { mapName, row, col }),
    });
  }

  private snapshotFor(client: GameSocket, loc: Location): PlayerSnapshot {
    return {
      username: client.data.username,
      race: client.data.race,
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
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    };
  }

  // Sleeping players "don't see anything in the room" — both helpers below
  // report nothing at all while asleep, regardless of what's actually
  // there. This covers every ack (sync, moves, look, etc.) in one place
  // rather than special-casing each handler. Resting doesn't affect
  // vision — only sleeping does.
  private monsterMessageFor(client: GameSocket, loc: Location): string | undefined {
    if (client.data.restState === 'sleeping') return undefined;
    const monster = this.monsterManager.getMonsterAt(loc.mapName, loc.row, loc.col);
    return monster ? `A ${monster.kind} is here!` : undefined;
  }

  private itemMessageFor(client: GameSocket, loc: Location): string | undefined {
    if (client.data.restState === 'sleeping') return undefined;
    const item = this.itemManager.getItemAt(loc.mapName, loc.row, loc.col);
    return item ? `${articleFor(item.name, true)} ${item.name} lies here.` : undefined;
  }

  // Notifies any connected player standing in the monster's old or new
  // cell that it just wandered off or arrived — the only way to see this
  // happen live, since MonsterManagerService.wanderAll runs on its own
  // timer, independent of anyone's commands. Sleeping players are skipped
  // (see monsterMessageFor) — their eyes are closed either way.
  private handleMonsterMoved(event: MonsterMoveEvent): void {
    const { monster, mapName, fromRow, fromCol, toRow, toCol } = event;

    for (const client of this.server.sockets.sockets.values()) {
      if (client.data.restState === 'sleeping') continue;

      const loc = this.worldManager.getLocation(client.data.username);
      if (!loc || loc.mapName !== mapName) continue;

      if (loc.row === fromRow && loc.col === fromCol) {
        client.emit('notice', {
          messages: [`The ${monster.kind} wanders out of the room.`],
          monsterMessage: this.monsterMessageFor(client, loc) ?? null,
        });
      } else if (loc.row === toRow && loc.col === toCol) {
        client.emit('notice', {
          messages: [`A ${monster.kind} wanders into the room!`],
          monsterMessage: this.monsterMessageFor(client, loc) ?? null,
        });
      }
    }
  }

  private hpPercent(monster: Monster): number {
    return Math.max(0, Math.round((monster.hp / monster.maxHp) * 100));
  }

  // The single place every combat-ending path routes through (kill, flee,
  // redirecting to a new target, disconnect) — so it's also the single
  // place that un-engages the monster, freeing it to wander again.
  private clearCombat(clientId: string): void {
    const existing = this.activeCombats.get(clientId);
    if (existing) {
      clearInterval(existing.timer);
      this.activeCombats.delete(clientId);
      this.monsterManager.setEngaged(existing.targetId, false);
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
  // that). Returns one line per event (hit, hp remaining, kill, level-up,
  // drop(s), counter-hit) so the client can log each separately — nothing
  // here is a persistent status display, it's all just message lines.
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
        // A level-up fully restores hp/mana/movement, same as a fresh
        // character — there's no separate "max stat" concept to scale yet,
        // so this is just the same 100/100/100 every character starts at.
        client.data.hp = 100;
        client.data.mana = 100;
        client.data.movement = 100;
        messages.push(
          `You leveled up! You are now level ${level}! Your health, mana, and movement have been fully restored.`
        );
      }

      this.monsterManager.getDeathDrops(target.kind).forEach((drop, i) => {
        this.itemManager.dropItem(drop.name, target.mapName, target.row, target.col, drop.skill);
        messages.push(
          i === 0
            ? `The ${kind} crumbles, leaving behind ${articleFor(drop.name)} ${drop.name}.`
            : `It also drops ${articleFor(drop.name)} ${drop.name}.`
        );
      });
    } else {
      messages.push(`The ${kind} has ${this.hpPercent(target)}% HP remaining.`);

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
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
        ended: true,
      });
      return;
    }

    const { messages, died } = this.resolveAttackExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    });

    client.emit('combat:update', {
      messages,
      player: this.snapshotFor(client, loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
      ended: died,
    });

    if (died) {
      this.clearCombat(client.id);
    }
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
  // persistPosition, for the same reason — combat, consuming, grabbing,
  // and the passive stat tick all mutate hp/mana/movement/exp/level/
  // skills/inventory mid-session.
  private async persistStats(
    username: string,
    stats: {
      hp: number;
      mana: number;
      movement: number;
      exp: number;
      level: number;
      skills: string[];
      inventory: string[];
      consumeExp: number;
    }
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
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
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

    const spaceIdx = text.indexOf(' ');
    const verb = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

    if (text === 'logout' || text === 'quit') {
      await this.sessionStore.clearActiveSession(username);
      this.activeConnections.clearActiveSocketIfCurrent(username, client.id);
      // Deferred so the ack (this return value) reaches the client before
      // the connection tears down — the ack is dispatched as a microtask
      // continuation of this handler's promise, which always runs before
      // this setImmediate's macrotask callback.
      setImmediate(() => client.disconnect(true));
      return { ok: true, messages: ['You have logged out.'], loggedOut: true };
    }

    // "attack"/"kill" and any of their prefixes (min 2 chars) all work —
    // "att skeleton", "ki skel", "attack skeleton" are equivalent.
    if (isAttackVerb(verb)) {
      return this.handleAttack(client, rest);
    }

    if (text === 'flee') {
      return this.handleFlee(client);
    }

    if (matchesPartial(verb, 'consume', CONSUME_MIN_LENGTH)) {
      return this.handleConsume(client, rest);
    }

    if (verb === 'grab' || verb === 'get') {
      return this.handleGrab(client, rest);
    }

    if (verb === 'drop') {
      return this.handleDrop(client, rest);
    }

    if (matchesPartial(verb, 'where', WHERE_MIN_LENGTH)) {
      return this.handleWhere(client, rest);
    }

    // Bare command, no argument — "inv", "inven", "inventory", ...
    if (matchesPartial(text, 'inventory', INVENTORY_MIN_LENGTH)) {
      return this.handleInventory(client);
    }

    if (text === 'skills') {
      return this.handleSkills(client);
    }

    if (text === 'worldmap') {
      return this.handleWorldMap(client);
    }

    if (text === 'map') {
      return this.handleMap(client);
    }

    // scan's stricter check runs first: "sca"/"scan" only ever prefix scan
    // (score's 3rd letter is "o"), so this never wrongly claims a score
    // input. Bare "sc" falls through to score below.
    if (matchesPartial(text, 'scan', SCAN_MIN_LENGTH)) {
      return this.handleScan(client);
    }

    if (matchesPartial(text, 'score', SCORE_MIN_LENGTH)) {
      return this.handleScore(client);
    }

    // "look"/"l" — an explicit abbreviation, not a partial-match range like
    // scan/score/inventory: "l" is a deliberately short alias with no
    // letters in between meant to work ("lo", "loo" don't), and it doesn't
    // collide with anything else since no other command starts with "l".
    if (text === 'look' || text === 'l') {
      return this.handleLook(client);
    }

    if (matchesPartial(text, 'sleep', SLEEP_MIN_LENGTH)) {
      return this.handleSleep(client);
    }

    // "rest"/"res"/"re" and "sit" are two spellings of the same toggle —
    // no partial matching requested for "sit", so it's a literal alias.
    if (matchesPartial(text, 'rest', REST_MIN_LENGTH) || text === 'sit') {
      return this.handleRest(client);
    }

    // "wake"/"stand" — no partials requested for either, both literal.
    if (text === 'wake' || text === 'stand') {
      return this.handleWake(client);
    }

    if (text === 'commands') {
      return this.handleCommands(client);
    }

    // Reserved for future vertical movement — no map has a floor/z axis
    // yet, so these are always valid syntax but never actually move you.
    if (text === 'u' || text === 'd') {
      return this.handleVerticalPlaceholder(client, text === 'u' ? 'up' : 'down');
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
        ackPayload.monsterMessage = this.monsterMessageFor(client, loc);
        ackPayload.itemMessage = this.itemMessageFor(client, loc);
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
        monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
        itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    };
  }

  // "attack <mob>" (or "kill", or a prefix of either) starts or redirects
  // an auto-attack loop: the player swings immediately (resolved
  // synchronously, in this ack), and if the target survives, a timer takes
  // over and repeats the same exchange every ATTACK_INTERVAL_MS via
  // tickCombat until it dies or the player flees. The target is marked
  // "engaged" (MonsterManagerService.setEngaged) so it can't wander away
  // mid-fight — the only way out is a kill or fleeing.
  private async handleAttack(client: GameSocket, mobQuery: string): Promise<CommandAck> {
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
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
      return buildAck(
        [`You are already attacking the ${target.kind}.`, `The ${target.kind} has ${this.hpPercent(target)}% HP remaining.`],
        true
      );
    }

    // Redirecting to a new target cancels whatever fight was running.
    this.clearCombat(client.id);

    const { messages, died } = this.resolveAttackExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    });

    if (died) {
      return buildAck(messages, true);
    }

    const targetId = target.id;
    const timer = setInterval(() => this.tickCombat(client, targetId), ATTACK_INTERVAL_MS);
    timer.unref();
    this.activeCombats.set(client.id, { timer, targetId });
    this.monsterManager.setEngaged(targetId, true);

    return buildAck(messages, true);
  }

  // The only way out of a fight: ends it immediately and moves the player
  // one step in a random direction that actually leads somewhere, same
  // underlying move pipeline as ordinary movement (so it can cross a map
  // exit same as a normal step would).
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
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
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
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
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
      monsterMessage: this.monsterMessageFor(client, newLoc),
      itemMessage: this.itemMessageFor(client, newLoc),
    };
  }

  // "consume <item>" — partial, case-insensitive match, checked first
  // against a dropped item in the player's current room, then (if nothing's
  // on the ground) against the player's own inventory — matching the "if
  // the item is not located on the ground" fallback. Messaging is
  // identical either way; only the source of the item's skill info
  // differs (DroppedItem.skill on the ground vs. a fresh lookup via
  // item-definitions.ts for an inventory item, which only stores a bare
  // name). Always removes the item once found, regardless of outcome. If
  // the item teaches a skill the player doesn't already have, there's a
  // per-item chance of learning it (e.g. 20% for a body part's "lesser
  // undead resistance", 5% for a bone dagger's "bone finger dagger
  // strike").
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    });

    if (!itemQuery) {
      return buildAck(['Consume what?'], false);
    }

    let name: string;
    let skill: ReturnType<typeof skillForItemName>;

    const groundItem = this.itemManager.findItemByNameAt(loc.mapName, loc.row, loc.col, itemQuery);
    if (groundItem) {
      this.itemManager.removeItem(groundItem.id);
      name = groundItem.name;
      skill = groundItem.skill;
    } else {
      const needle = itemQuery.toLowerCase();
      const invName = client.data.inventory.find((n) => n.toLowerCase().includes(needle));
      if (!invName) {
        return buildAck([`There is no "${itemQuery}" here or in your inventory to consume.`], false);
      }
      const index = client.data.inventory.indexOf(invName);
      client.data.inventory = [...client.data.inventory.slice(0, index), ...client.data.inventory.slice(index + 1)];
      name = invName;
      skill = skillForItemName(invName);
    }

    if (!skill) {
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
      });
      return buildAck([`You consume the ${name}.`], true);
    }

    // Consuming a body part always counts toward consumeExp, regardless of
    // whether the skill roll below actually succeeds.
    client.data.consumeExp += 1;

    const { reward, chance } = skill;
    let messages: string[];
    if (client.data.skills.includes(reward)) {
      messages = [`You consume the ${name}, but you already know this secret.`];
    } else if (Math.random() >= chance) {
      messages = [`You consume the ${name}, but feel nothing happen.`];
    } else {
      client.data.skills = [...client.data.skills, reward];
      messages = [`You consume the ${name}.`, `You have gained ${reward}!`];
    }

    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    });

    return buildAck(messages, true);
  }

  // "grab"/"get <item>" — same partial-name matching as consume, but adds
  // the item to the player's permanent inventory instead of eating it.
  private async handleGrab(client: GameSocket, itemQuery: string): Promise<CommandAck> {
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    });

    if (!itemQuery) {
      return buildAck(['Grab what?'], false);
    }

    const item = this.itemManager.findItemByNameAt(loc.mapName, loc.row, loc.col, itemQuery);
    if (!item) {
      return buildAck([`There is no "${itemQuery}" here to grab.`], false);
    }

    this.itemManager.removeItem(item.id);
    client.data.inventory = [...client.data.inventory, item.name];
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    });

    return buildAck([`You pick up the ${item.name}.`], true);
  }

  // "drop <item>" — the inverse of grab: partial, case-insensitive match
  // against the player's inventory (not the ground), removes it from
  // inventory and places it on the ground in the player's current room.
  // Looks the name back up in item-definitions.ts so a re-dropped item
  // regains its original skill-teaching properties instead of becoming an
  // inert copy — inventory only stores bare names, no metadata.
  private async handleDrop(client: GameSocket, itemQuery: string): Promise<CommandAck> {
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    });

    if (!itemQuery) {
      return buildAck(['Drop what?'], false);
    }

    const needle = itemQuery.toLowerCase();
    const itemName = client.data.inventory.find((name) => name.toLowerCase().includes(needle));
    if (!itemName) {
      return buildAck([`You aren't carrying a "${itemQuery}".`], false);
    }

    const index = client.data.inventory.indexOf(itemName);
    client.data.inventory = [...client.data.inventory.slice(0, index), ...client.data.inventory.slice(index + 1)];
    this.itemManager.dropItem(itemName, loc.mapName, loc.row, loc.col, skillForItemName(itemName));

    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
    });

    return buildAck([`You drop the ${itemName}.`], true);
  }

  // Purely informational — no state change, so unlike every other handler
  // here neither of these needs to be async.
  private handleInventory(client: GameSocket): CommandAck {
    const { username, inventory } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = inventory.length > 0 ? [`Your inventory: ${inventory.join(', ')}.`] : ['Your inventory is empty.'];

    return {
      ok: true,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    };
  }

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
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    };
  }

  // "map" — the whole current map's static layout ('.'/'*' per
  // resolveFullMapGrid), deliberately never marking the player's own
  // position (that's what the minimap is for). Just an info command, no
  // state change, so it's synchronous like skills/inventory.
  private handleMap(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    return {
      ok: true,
      messages: [`Map of ${loc.mapName}:`, ...resolveFullMapGrid(loc.mapName)],
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    };
  }

  // "look"/"l" — re-announces the current room's monster/item exactly as
  // if the player had just stepped into it, bypassing the "only when it's
  // genuinely new" dedup the client applies to monsterMessage/itemMessage
  // (see useGameConnection's withSightings): these lines are sent as
  // ordinary messages, not just the monsterMessage/itemMessage fields, so
  // they always print in the log regardless of whether anything changed
  // since the last look.
  private handleLook(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    const monsterMessage = this.monsterMessageFor(client, loc);
    const itemMessage = this.itemMessageFor(client, loc);
    const messages = [monsterMessage, itemMessage].filter((m): m is string => !!m);
    if (messages.length === 0) {
      messages.push('There is nothing else of note here.');
    }

    return {
      ok: true,
      messages,
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage,
      itemMessage,
    };
  }

  // "scan" — checks the 4 adjacent cells (1 step north/south/east/west,
  // never leaving the current map) and reports which ones have a monster
  // in them, same "A skeleton is here!" phrasing as monsterMessage. A
  // direction that would fall off the map's edge is skipped entirely
  // rather than reported on — there's no room there to scan.
  private handleScan(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    const map = getMap(loc.mapName);
    const messages = ['You scan the surrounding rooms:'];

    for (const direction of ALL_DIRECTIONS) {
      const delta = DIRECTION_DELTAS[direction];
      const row = loc.row + delta.dr;
      const col = loc.col + delta.dc;
      if (!map.isInBounds(row, col)) continue;

      const label = direction.charAt(0).toUpperCase() + direction.slice(1);
      const monster = this.monsterManager.getMonsterAt(loc.mapName, row, col);
      messages.push(monster ? `${label}: A ${monster.kind} is here!` : `${label}: Nothing of note.`);
    }

    return {
      ok: true,
      messages,
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    };
  }

  // "score"/"sc"/"sco"/"scor" — a text rendering of exactly what the Score
  // box on screen already shows: username, then one line per stat (race,
  // level, hp, mana, movement, exp, consumeExp), same labels as the box.
  // Purely informational, same as skills/inventory/map.
  private handleScore(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = [
      username,
      `RACE: ${client.data.race}`,
      `LVL: ${client.data.level}`,
      `HP: ${client.data.hp}`,
      `MP: ${client.data.mana}`,
      `MV: ${client.data.movement}`,
      `XP: ${client.data.exp}`,
      `CXP: ${client.data.consumeExp}`,
    ];

    return {
      ok: true,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    };
  }

  // Every other connected player sharing this player's actual World
  // instance (WorldManagerService's worldId — the worker_thread-sharded
  // concept, not just "same map name": two players on the same map but in
  // different overflow shards aren't in the same World). Self is always
  // excluded — "where" reporting your own room back to you isn't useful.
  private otherPlayersInWorld(client: GameSocket, worldId: string): Array<{ username: string; mapName: MapName }> {
    const results: Array<{ username: string; mapName: MapName }> = [];
    for (const other of this.server.sockets.sockets.values()) {
      if (other.id === client.id) continue;
      const otherLoc = this.worldManager.getLocation(other.data.username);
      if (otherLoc && otherLoc.worldId === worldId) {
        results.push({ username: other.data.username, mapName: otherLoc.mapName });
      }
    }
    return results;
  }

  // "where" (bare) lists every other player sharing the caller's World
  // instance and which room they're in — "Players nearby:" with nothing
  // under it if there are none. "where <query>" (or "whe"/"wher") checks
  // monsters first, same as before, then falls back to a partial,
  // case-insensitive match against other players' usernames — so it can
  // locate a person the same way it locates a monster. Monsters aren't
  // sharded per World instance the way player positions are (there's only
  // ever one MonsterManagerService, global to the process), so a
  // monster's "same World" check is by map name; a player's is by the
  // real worldId, since that's the concept that actually applies to them.
  private handleWhere(client: GameSocket, mobQuery: string): CommandAck {
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    });

    if (!mobQuery) {
      const others = this.otherPlayersInWorld(client, loc.worldId);
      const messages = ['Players nearby:', ...others.map((o) => `${o.username} is in ${getRoomName(o.mapName)}.`)];
      return buildAck(messages, true);
    }

    const target = this.monsterManager.findMonsterByName(mobQuery);
    if (target && target.mapName === loc.mapName) {
      return buildAck([`The ${target.kind} is in ${getRoomName(target.mapName)}.`], true);
    }

    const needle = mobQuery.toLowerCase();
    const matchedPlayer = this.otherPlayersInWorld(client, loc.worldId).find((o) =>
      o.username.toLowerCase().includes(needle)
    );
    if (matchedPlayer) {
      return buildAck([`${matchedPlayer.username} is in ${getRoomName(matchedPlayer.mapName)}.`], true);
    }

    return buildAck(['That monster was not found.'], false);
  }

  // "sleep"/"slee"/"sle" — a toggle: awake or resting -> asleep on the
  // first call, asleep -> awake on the next (see handleWake for the
  // explicit, direction-agnostic version of the "wake up" half). While
  // asleep, monsterMessageFor/itemMessageFor report nothing at all (see
  // those methods) — the character's eyes are closed to its own room,
  // full stop, for every command, not just this one. The regen tick (see
  // statTick) keeps running the whole time regardless — sleeping just
  // changes its heal percentage and message, same as resting does.
  private handleSleep(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    if (client.data.restState === 'sleeping') {
      client.data.restState = 'awake';
      return {
        ok: true,
        messages: ['You wake up.'],
        player: this.snapshotFor(client, loc),
        minimap: this.worldManager.getMinimap(username),
        room: resolveRoom(loc),
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
      };
    }

    client.data.restState = 'sleeping';
    return {
      ok: true,
      messages: ["You lie down and drift off to sleep. You won't see anything in the room until you wake up."],
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    };
  }

  // "rest"/"res"/"re", or "sit" — same toggle shape as sleep, but to/from
  // 'resting' instead of 'sleeping': a smaller heal-percentage boost (see
  // HEAL_PERCENT_RANGE) and, unlike sleeping, no vision suppression.
  private handleRest(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    if (client.data.restState === 'resting') {
      client.data.restState = 'awake';
      return {
        ok: true,
        messages: ['You stand up.'],
        player: this.snapshotFor(client, loc),
        minimap: this.worldManager.getMinimap(username),
        room: resolveRoom(loc),
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
      };
    }

    client.data.restState = 'resting';
    return {
      ok: true,
      messages: ['You sit down to rest.'],
      player: this.snapshotFor(client, loc),
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    };
  }

  // "wake"/"stand" — the explicit, direction-agnostic counterpart to
  // sleep/rest's self-toggle: always returns to 'awake' regardless of
  // which of the two states the player was in, unlike typing "sleep"
  // while resting (which would instead go directly from sitting to lying
  // down) or "rest" while sleeping (sitting up from lying down).
  private handleWake(client: GameSocket): CommandAck {
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
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
    });

    if (client.data.restState === 'awake') {
      return buildAck(['You are already up and about.'], false);
    }

    const message = client.data.restState === 'sleeping' ? 'You wake up.' : 'You stand up.';
    client.data.restState = 'awake';
    return buildAck([message], true);
  }

  // Deliberately a setTimeout chain, not setInterval — each firing picks a
  // fresh random delay in [STAT_TICK_MIN_MS, STAT_TICK_MAX_MS) for the
  // next one, so the cadence is irregular rather than a fixed period. One
  // shared timer for the whole gateway (started once in afterInit, never
  // per-connection) — every connected player is healed on the exact same
  // tick, rather than each running their own independently-randomized
  // cycle. Runs for the process's lifetime regardless of whether anyone's
  // connected; a firing with no sockets connected is just a no-op loop.
  private scheduleGlobalStatTick(): void {
    const delay = randomBetween(STAT_TICK_MIN_MS, STAT_TICK_MAX_MS);
    this.globalStatTickTimer = setTimeout(() => this.globalStatTick(), delay);
    this.globalStatTickTimer.unref();
  }

  private globalStatTick(): void {
    for (const client of this.server.sockets.sockets.values()) {
      this.applyStatTick(client);
    }
    this.scheduleGlobalStatTick();
  }

  // The actual per-player heal effect of a single global tick — still
  // individually rolled per player (a resting player's 4-7% and an awake
  // player's 2-5% are each their own random roll), only the timing of the
  // tick itself is shared across everyone.
  private applyStatTick(client: GameSocket): void {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) return;

    const [min, max] = HEAL_PERCENT_RANGE[client.data.restState];
    const percent = randomBetween(min, max);
    const healed = (current: number) => Math.min(MAX_STAT, current + Math.round((percent / 100) * MAX_STAT));

    const beforeHp = client.data.hp;
    const beforeMana = client.data.mana;
    const beforeMovement = client.data.movement;

    client.data.hp = healed(client.data.hp);
    client.data.mana = healed(client.data.mana);
    client.data.movement = healed(client.data.movement);

    const hpGain = client.data.hp - beforeHp;
    const manaGain = client.data.mana - beforeMana;
    const movementGain = client.data.movement - beforeMovement;

    if (hpGain > 0 || manaGain > 0 || movementGain > 0) {
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
      });

      const lead =
        client.data.restState === 'sleeping'
          ? 'You stir in your sleep'
          : client.data.restState === 'resting'
            ? 'You rest quietly'
            : 'You catch your breath';

      client.emit('notice', {
        messages: [`${lead}, recovering ${hpGain} HP, ${manaGain} MP, and ${movementGain} MV.`],
        player: this.snapshotFor(client, loc),
      });
    }
  }

  // "worldmap" — a coarse overview of every area and what it connects to
  // (no per-room detail). The client opens a modal for this rather than
  // logging it as a message line — see CommandAck.worldMap.
  private handleWorldMap(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    return {
      ok: true,
      messages: ['You examine a weathered map of the world.'],
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
      worldMap: getWorldOverview(),
    };
  }

  // No map has a floor/z axis yet, so "u"/"d" are always valid syntax but
  // never actually move you — see the note on DIRECTION_ALIASES.
  private handleVerticalPlaceholder(client: GameSocket, direction: 'up' | 'down'): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    return {
      ok: false,
      messages: [`There is no way ${direction} from here yet.`],
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    };
  }

  // Purely informational — a static reference list, no state change.
  private handleCommands(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = [
      'Available commands:',
      'n, s, e, w - move north, south, east, or west',
      'u, d - move up or down (not available yet)',
      'attack/kill (or k) <mob> - attack a monster in your room',
      'flee - break off a fight and flee in a random direction',
      'consume <item> - eat an item (on the ground, or in your inventory) for a chance at a skill',
      'grab/get <item> - pick up a dropped item into your inventory',
      'drop <item> - drop an item from your inventory onto the ground',
      'where [mob or player] - list nearby players, or locate a monster/player by name',
      'inventory - show what you are carrying',
      'skills - show your learned skills',
      'look/l - look around the room again',
      'map - show this area\'s full layout',
      'scan - check the 4 adjacent rooms for monsters',
      'score - show your character\'s stats',
      "sleep - lie down and close your eyes, recovering hp/mana/movement faster until you wake up",
      'rest/sit - sit down to rest, recovering hp/mana/movement a bit faster than standing around',
      'wake/stand - get up from sleeping or resting',
      'worldmap - show an overview of the whole world',
      'clear - clear the message log',
      'logout/quit - log out',
      'commands - show this list',
    ];

    return {
      ok: true,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    };
  }
}
