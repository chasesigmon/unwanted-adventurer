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
import { DummyPlayerService } from '../players/dummy-player.service.js';
import type { DummyPlayer } from '../players/dummy-player.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import type { MonsterMoveEvent } from '../monsters/monster-manager.service.js';
import { ItemManagerService } from '../items/item-manager.service.js';
import { CorpseManagerService } from '../items/corpse-manager.service.js';
import type { Corpse } from '../items/corpse-manager.service.js';
import {
  skillForItemName,
  equipmentForItemName,
  itemDescriptionFor,
  isBodyPart,
  EQUIPMENT_SLOT_ORDER,
  EQUIPMENT_SLOT_LABELS,
} from '../items/item-definitions.js';
import type { EquipmentSlot } from '../items/item-definitions.js';
import type { DroppedItem } from '../items/dropped-item.js';
import { monsterDescriptionFor } from '../monsters/monster.js';
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
import { findHelpTopic } from '../help/help-topics.js';
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

// Base damage before any equipped weapon bonus — see EquipmentDefinition
// .attackBonus and resolveAttackExchange's weaponForAttack.
//
// Two formulas live in this file, both centered on the same idea (an
// edge in some stat should matter, but shouldn't ever swing so far it
// feels arbitrary):
//
// 1. Attack damage bonus (attributeAttackBonus): every 2 points of
//    strength advantage over the opponent, plus every 2 levels of level
//    advantage, each contribute +1 damage — the two add together, then
//    clamp at 0 (a weaker/lower-level attacker gets no bonus, never a
//    penalty). floor((str_self - str_opp) / 2) + floor(level_self -
//    level_opp) / 2), minimum 0.
//
// 2. Power-comparison message (powerComparisonMessage, for "examine"):
//    level difference alone (not strength) sorted into 7 graded bands —
//    "no match at all" / "significantly weaker" / "slightly weaker" /
//    "evenly matched" / "slightly stronger" / "significantly stronger" /
//    "could destroy you" — at gaps of roughly 2 and 5 levels either way.
const PLAYER_ATTACK_DAMAGE = 6;
// Flat counter-attack damage for any monster kind (not species-specific).
const MONSTER_ATTACK_DAMAGE = 2;
const ATTACK_INTERVAL_MS = 4000;
const ALL_DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];
// hp/mana/movement all cap at this same value.
const MAX_STAT = 100;

// Per-step movement-point cost, based on the *departure* room's
// GameMap.setting — "inside" (Labyrinth, stone) is cheaper to move
// through than "outside" (Great Plains, grass). Applies to any move that
// actually changes position (ordinary steps and fleeing alike); clamped
// at 0, never blocks the move itself even at 0 movement.
const INSIDE_MOVEMENT_COST = 2;
const OUTSIDE_MOVEMENT_COST = 3;

// "sacrifice" (manual or automatic) — gold reward scales with the
// corpse's level, not a flat amount, so a future stronger monster kind
// pays out more without this needing to change.
const SACRIFICE_GOLD_PER_LEVEL = 3;

// "murder <player>" death consequences — exp loss scales with the
// victim's own level (same reasoning as the gold formula above); the
// respawn point is a single fixed cell regardless of where or how they
// died. Row 7 is Labyrinth's center row (rows 0-14); col 14 is its
// easternmost column — "the far east of Labyrinth".
const PLAYER_DEATH_EXP_LOSS_PER_LEVEL = 10;
const PLAYER_RESPAWN_DELAY_MS = 15_000;
const FAR_EAST_LABYRINTH: Location = { mapName: 'Labyrinth', row: 7, col: 14 };

// "attack"/"kill" can both be partially typed ("att", "ki", ...). A
// minimum length keeps a bare single letter from being swallowed here
// instead of falling through to movement — "a" must stay west, not become
// a 1-letter prefix of "attack". "kill" gets a further single-letter
// shorthand ("k") on top of that, since nothing else claims that letter.
const ATTACK_VERBS = ['attack', 'kill'];
const ATTACK_VERB_MIN_LENGTH = 2;
const KILL_SHORTHAND = 'k';

// "grab"/"get" are two spellings of the same action, so both accept
// prefixes down to a single letter ("g") — unlike attack/kill, there's no
// ambiguity to worry about (either word resolves to the same handler), and
// nothing else claims "g".
const GRAB_VERBS = ['grab', 'get'];
const GRAB_VERB_MIN_LENGTH = 1;

// "inventory" can be partially typed too, down to a single letter ("i") —
// nothing else claims "i" as a bare command.
const INVENTORY_MIN_LENGTH = 1;

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

// "sk"/"ski"/"skil"/"skill" — nothing else starts with "sk".
const SKILLS_MIN_LENGTH = 2;

// "eq"/"equ"/"equi"/"equip"/... — checked against the single word
// "equipment" rather than "equip" separately, since every prefix of
// "equip" ("eq", "equ", "equi", "equip") is *also* a prefix of
// "equipment" ("equipment".startsWith("equip") is true) — one check
// covers both "equip <item>" and bare "equipment"/its own partials. Which
// behavior you get depends on whether there's a trailing item argument,
// not on which exact prefix was typed — see the dispatch site.
const EQUIP_MIN_LENGTH = 2;

// "rem"/"remo"/"remov"/"remove" — the example floor from the request;
// nothing else starts with "rem".
const REMOVE_MIN_LENGTH = 3;

// "exa"/"exam"/"exami"/"examin"/"examine" — 3 is the example floor from
// the request ("exa" all the way to "examine"); nothing else starts with
// "exa" so there's no disambiguation requirement either.
const EXAMINE_MIN_LENGTH = 3;

// "auto sac"/"auto sacrifice" — the request's own two examples; "sac" is
// the floor since only one auto-toggle exists to disambiguate against yet.
const AUTO_TOGGLE_MIN_LENGTH = 3;

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

// Separate from ActiveCombat (monsters only) — "murder <player>" is its
// own PvP-only combat loop, so a player can't accidentally end up
// simultaneously "attacking" a monster and "murdering" a player through
// the same bookkeeping. targetId is the other socket's client.id for a
// real player, or the DummyPlayer's id for a dummy.
interface ActiveMurder {
  timer: NodeJS.Timeout;
  targetKind: 'real' | 'dummy';
  targetId: string;
}

// Either kind of "player" a room can hold — a real connected socket, or
// one of the fixed dummy players (see DummyPlayerService). Returned by
// findPlayerLikeAt/getPlayerLikeById and consumed by resolveMurderExchange
// so murder combat doesn't need two entirely separate code paths.
type PlayerLikeTarget = { kind: 'real'; socket: GameSocket } | { kind: 'dummy'; dummy: DummyPlayer };

// "a leg" vs "an arm" — used for both the dropped-item room message and
// the kill message, since the same body-part pool includes vowel-leading
// names.
function articleFor(word: string, capitalized = false): string {
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return capitalized ? article.charAt(0).toUpperCase() + article.slice(1) : article;
}

// "a, b, and c" (or "a and b", or just "a") — shared by any message that
// needs to list several item phrases in one natural sentence.
function joinWithAnd(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

// A cell can hold more than one dropped item at once (e.g. a skeleton's
// guaranteed body part plus its separately-rolled bone dagger) — this
// builds one natural-language sentence covering all of them ("A hand and
// a bone dagger lie here.") instead of only ever describing the first,
// which was the root cause of a dropped-alongside item going invisible to
// itemMessageFor/"look" even though it was still on the ground and
// grabbable by name.
function describeItemsOnGround(items: DroppedItem[]): string | undefined {
  if (items.length === 0) return undefined;
  const phrases = items.map((item, i) => `${articleFor(item.name, i === 0)} ${item.name}`);
  return `${joinWithAnd(phrases)} ${items.length === 1 ? 'lies' : 'lie'} here.`;
}

// Pluralizes just the last word of a (possibly multi-word) item name —
// "bone dagger" -> "bone daggers", "leg" -> "legs" — since every current
// item name is regular, a plain suffix rule covers them all.
function pluralize(word: string): string {
  if (/[sxz]$/i.test(word) || /(ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function pluralizeItemName(name: string): string {
  const lastSpace = name.lastIndexOf(' ');
  if (lastSpace === -1) return pluralize(name);
  return `${name.slice(0, lastSpace)} ${pluralize(name.slice(lastSpace + 1))}`;
}

// "look" — unlike describeItemsOnGround (one combined sentence, used for
// the itemMessage sighting field), this puts each *unique* item name on
// its own line, collapsing duplicates into a count ("There are 4 bone
// daggers here.") instead of listing each one individually.
function groupedItemLines(items: DroppedItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, count]) =>
    count === 1 ? `${articleFor(name, true)} ${name} lies here.` : `There are ${count} ${pluralizeItemName(name)} here.`
  );
}

// Shared by "equip"/"equipment" (bare) and "examine <player or monster>" —
// same slot list/labels either way, just a different header and whichever
// equipment record is being described (a monster's is always empty; there's
// no mechanic for monsters to equip anything yet, but the request asked for
// the slots to be shown regardless).
function equipmentLines(header: string, equipment: Record<string, string>): string[] {
  return [header, ...EQUIPMENT_SLOT_ORDER.map((slot) => `${EQUIPMENT_SLOT_LABELS[slot]}: ${equipment[slot] ?? '(empty)'}`)];
}

// "examine <player or monster>" — a level-difference formula that scales
// message intensity with how significant the gap is, symmetric around 0
// (evenly matched). See the class doc comment near PLAYER_ATTACK_DAMAGE
// for the exact thresholds.
function powerComparisonMessage(selfLevel: number, otherLevel: number, label: string): string {
  const diff = otherLevel - selfLevel;
  if (diff <= -5) return `${label} looks like no match for you at all.`;
  if (diff <= -2) return `${label} looks significantly weaker than you.`;
  if (diff < 0) return `${label} looks slightly weaker than you.`;
  if (diff === 0) return `${label} looks evenly matched with you.`;
  if (diff < 2) return `${label} looks slightly stronger than you.`;
  if (diff < 5) return `${label} looks significantly stronger than you.`;
  return `${label} looks like it could destroy you.`;
}

function isAttackVerb(word: string): boolean {
  if (word === KILL_SHORTHAND) return true;
  return word.length >= ATTACK_VERB_MIN_LENGTH && ATTACK_VERBS.some((verb) => verb.startsWith(word));
}

function isGrabVerb(word: string): boolean {
  return word.length >= GRAB_VERB_MIN_LENGTH && GRAB_VERBS.some((verb) => verb.startsWith(word));
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
  // PvP-only, separate from activeCombats — see ActiveMurder/"murder".
  private readonly activeMurders = new Map<string, ActiveMurder>();
  // One shared timer for every connection, not one per socket — see
  // scheduleGlobalStatTick — so every player is on the same tick, rather
  // than each running their own independent randomized cycle.
  private globalStatTickTimer?: NodeJS.Timeout;

  constructor(
    private readonly playersService: PlayersService,
    private readonly dummyPlayerService: DummyPlayerService,
    private readonly worldManager: WorldManagerService,
    private readonly monsterManager: MonsterManagerService,
    private readonly itemManager: ItemManagerService,
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
    client.data.strength = doc?.strength ?? 1;
    client.data.intelligence = doc?.intelligence ?? 1;
    client.data.wisdom = doc?.wisdom ?? 1;
    client.data.dexterity = doc?.dexterity ?? 1;
    client.data.constitution = doc?.constitution ?? 1;
    client.data.hp = doc?.hp ?? 100;
    client.data.mana = doc?.mana ?? 100;
    client.data.movement = doc?.movement ?? 100;
    client.data.exp = doc?.exp ?? 0;
    client.data.level = doc?.level ?? 1;
    client.data.skills = doc?.skills ?? [];
    client.data.inventory = doc?.inventory ?? [];
    client.data.consumeExp = doc?.consumeExp ?? 0;
    client.data.equipment = doc?.equipment ?? {};
    client.data.gold = doc?.gold ?? 0;
    client.data.autoSacrifice = doc?.autoSacrifice ?? false;
    // Never persisted — a fresh connection always starts awake and alive.
    client.data.restState = 'awake';
    client.data.respawnState = 'alive';

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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      exp: client.data.exp,
      level: client.data.level,
      maxTnl: maxTnlForLevel(client.data.level),
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
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

  // "The wild skeleton's corpse lies here." / "PlayerName's corpse lies
  // here." — undefined if there's no corpse in this cell. Shared by
  // itemMessageFor (folded into the same sighting field) and "look"
  // (its own explicit line).
  private corpseLineFor(loc: Location): string | undefined {
    const corpse = this.corpseManager.getCorpseAt(loc.mapName, loc.row, loc.col);
    if (!corpse) return undefined;
    return corpse.ownerType === 'monster' ? `The ${corpse.label}'s corpse lies here.` : `${corpse.label}'s corpse lies here.`;
  }

  private itemMessageFor(client: GameSocket, loc: Location): string | undefined {
    if (client.data.restState === 'sleeping') return undefined;
    const itemLine = describeItemsOnGround(this.itemManager.getItemsAt(loc.mapName, loc.row, loc.col));
    const corpseLine = this.corpseLineFor(loc);
    return [itemLine, corpseLine].filter((s): s is string => !!s).join(' ') || undefined;
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
          messages: this.withStatusPrompt(client, [`The ${monster.kind} wanders out of the room.`]),
          monsterMessage: this.monsterMessageFor(client, loc) ?? null,
        });
      } else if (loc.row === toRow && loc.col === toCol) {
        client.emit('notice', {
          messages: this.withStatusPrompt(client, [`A ${monster.kind} wanders into the room!`]),
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

  // PvP equivalent of clearCombat — no "engaged" concept to release
  // (unlike monsters, a player-like target isn't excluded from anything
  // else while being murdered).
  private clearMurder(clientId: string): void {
    const existing = this.activeMurders.get(clientId);
    if (existing) {
      clearInterval(existing.timer);
      this.activeMurders.delete(clientId);
    }
  }

  // Fresh lookup by id — same reasoning as MonsterManagerService
  // .getMonsterById for tickCombat: a tick loop only has the id it locked
  // onto when the fight started, and the underlying entity (especially a
  // real player) can move, disconnect, or already be gone by the time the
  // next tick fires.
  private getPlayerLikeById(targetKind: 'real' | 'dummy', targetId: string): PlayerLikeTarget | undefined {
    if (targetKind === 'dummy') {
      const dummy = this.dummyPlayerService.getById(targetId);
      return dummy ? { kind: 'dummy', dummy } : undefined;
    }
    const socket = this.server.sockets.sockets.get(targetId);
    return socket ? { kind: 'real', socket } : undefined;
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

  // The equipped weapon's contribution to an attack — a damage bonus
  // added to PLAYER_ATTACK_DAMAGE, and a verb that replaces "hit" in the
  // attack line (e.g. a bone dagger "stabs" rather than "hits"). No
  // weapon equipped (or an equipped item with no EquipmentDefinition, in
  // practice never possible for something already in the 'weapon' slot)
  // falls back to bare-handed values.
  private weaponAttack(client: GameSocket): { damage: number; verb: string } {
    const weaponName = client.data.equipment.weapon;
    const definition = weaponName ? equipmentForItemName(weaponName) : undefined;
    return {
      damage: PLAYER_ATTACK_DAMAGE + (definition?.attackBonus ?? 0),
      verb: definition?.attackVerb ?? 'hit',
    };
  }

  // Strength (and level) versus the opponent's own — every 2 points of
  // relative strength advantage, and every 2 levels of relative level
  // advantage, each add +1 attack damage; the two add together. Clamped
  // at 0: a weaker or lower-level attacker just gets no bonus, never a
  // penalty below the weapon-adjusted base ("add attack points", not
  // subtract them). See the class doc comment for the exact formula.
  // Takes just the two fields it needs (not a full Monster) so the same
  // formula applies unchanged to a player-like murder target too (real
  // SocketData or DummyPlayer both have strength/level).
  private attributeAttackBonus(client: GameSocket, target: { strength: number; level: number }): number {
    const strengthEdge = client.data.strength - target.strength;
    const levelEdge = client.data.level - target.level;
    const bonus = Math.floor(strengthEdge / 2) + Math.floor(levelEdge / 2);
    return Math.max(0, bonus);
  }

  // The core "basic hit" exchange, shared by the first (synchronous) hit in
  // handleAttack and every subsequent tick in tickCombat: player swings for
  // PLAYER_ATTACK_DAMAGE plus whatever their equipped weapon adds plus an
  // attribute-based bonus (see attributeAttackBonus); if that doesn't kill
  // it, it swings back (reduced by 1 if the target is undead and the
  // player has learned resistance to that). Returns one line per event
  // (hit, hp remaining, kill, level-up, drop(s), counter-hit) so the
  // client can log each separately — nothing here is a persistent status
  // display, it's all just message lines.
  private resolveAttackExchange(client: GameSocket, target: Monster): { messages: string[]; died: boolean } {
    const { kind, expReward } = target;
    const { damage: weaponDamage, verb } = this.weaponAttack(client);
    const attackDamage = weaponDamage + this.attributeAttackBonus(client, target);
    const { died } = this.monsterManager.applyDamage(target.id, attackDamage);

    const messages = [`You ${verb} the ${kind} for ${attackDamage} damage!`];

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
        // Base attributes each go up by 1 per level gained (in practice
        // always exactly 1 level per kill, given current exp numbers).
        const levelsGained = level - before;
        client.data.strength += levelsGained;
        client.data.intelligence += levelsGained;
        client.data.wisdom += levelsGained;
        client.data.dexterity += levelsGained;
        client.data.constitution += levelsGained;
        client.data.hp = 100;
        client.data.mana = 100;
        client.data.movement = 100;
        messages.push(
          `You leveled up! You are now level ${level}! Your health, mana, and movement have been fully restored, and your attributes have increased.`
        );
      }

      // Body parts always land loose on the ground, same as before ("The
      // wild skeleton crumbles, leaving behind a leg."); anything else
      // (e.g. a bone dagger) goes into a new corpse instead — the corpse
      // always appears regardless of contents, since it's also the
      // "sacrifice" target.
      const bodyPartPhrases: string[] = [];
      const corpseItems: string[] = [];
      this.monsterManager.getDeathDrops(target.kind).forEach((drop) => {
        if (isBodyPart(drop.name)) {
          this.itemManager.dropItem(drop.name, target.mapName, target.row, target.col, drop.skill);
          bodyPartPhrases.push(`${articleFor(drop.name)} ${drop.name}`);
        } else {
          corpseItems.push(drop.name);
        }
      });
      if (bodyPartPhrases.length > 0) {
        messages.push(`The ${kind} crumbles, leaving behind ${joinWithAnd(bodyPartPhrases)}.`);
      }

      const corpse = this.corpseManager.createMonsterCorpse(kind, target.level, target.mapName, target.row, target.col, corpseItems);

      if (client.data.autoSacrifice) {
        const goldReward = this.sacrificeCorpse(client, corpse);
        messages.push(
          `You automatically sacrifice the ${kind}'s remains to the gods, receiving ${goldReward} gold coin${goldReward === 1 ? '' : 's'}.`
        );
      } else {
        messages.push(
          corpseItems.length > 0
            ? `Its corpse holds ${joinWithAnd(corpseItems.map((name) => `${articleFor(name)} ${name}`))}.`
            : 'Its corpse remains here.'
        );
      }
    } else {
      messages.push(`The ${kind} has ${this.hpPercent(target)}% HP remaining.`);

      const reduction = target.undead ? undeadDamageReduction(client.data.skills) : 0;
      const damage = Math.max(0, MONSTER_ATTACK_DAMAGE - reduction);
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
        messages: this.withStatusPrompt(client, ['Your target is gone.']),
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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    client.emit('combat:update', {
      messages: this.withStatusPrompt(client, messages),
      player: this.snapshotFor(client, loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
      ended: died,
    });

    if (died) {
      this.clearCombat(client.id);
    }
  }

  // "murder <player>" — the PvP-only counterpart of resolveAttackExchange,
  // same weapon/attribute damage formulas, against a player-like target
  // (real or dummy) instead of a Monster. Dummy targets counter-attack
  // with the same flat MONSTER_ATTACK_DAMAGE a monster would (they're
  // NPC-like, no human to drive a response); real player targets don't
  // auto-counter — they'd need to "murder" back themselves to retaliate.
  private resolveMurderExchange(client: GameSocket, target: PlayerLikeTarget): { messages: string[]; died: boolean } {
    const targetData = target.kind === 'real' ? target.socket.data : target.dummy;
    const { damage: weaponDamage, verb } = this.weaponAttack(client);
    const attackDamage = weaponDamage + this.attributeAttackBonus(client, targetData);

    let died: boolean;
    if (target.kind === 'real') {
      target.socket.data.hp = Math.max(0, target.socket.data.hp - attackDamage);
      died = target.socket.data.hp <= 0;
    } else {
      ({ died } = this.dummyPlayerService.applyDamage(target.dummy.id, attackDamage));
    }

    const messages = [`You ${verb} ${targetData.username} for ${attackDamage} damage!`];

    if (died) {
      messages.push(`You have murdered ${targetData.username}!`);
      this.handlePlayerLikeDeath(target);
    } else {
      const hp = target.kind === 'real' ? target.socket.data.hp : target.dummy.hp;
      const maxHp = target.kind === 'real' ? MAX_STAT : target.dummy.maxHp;
      messages.push(`${targetData.username} has ${Math.max(0, Math.round((hp / maxHp) * 100))}% HP remaining.`);

      if (target.kind === 'dummy') {
        client.data.hp = Math.max(0, client.data.hp - MONSTER_ATTACK_DAMAGE);
        messages.push(`${targetData.username} hits you for ${MONSTER_ATTACK_DAMAGE} damage.`);
      } else {
        const victimLoc = this.worldManager.getLocation(target.socket.data.username);
        if (victimLoc) {
          target.socket.emit('notice', {
            messages: this.withStatusPrompt(target.socket, [
              `${client.data.username} is attacking you for ${attackDamage} damage!`,
            ]),
            player: this.snapshotFor(target.socket, victimLoc),
          });
        }
      }
    }

    return { messages, died };
  }

  // Corpse (holding everything equipped/carried), exp loss (real players
  // only — dummies have no exp to lose), and a 15s respawn at
  // FAR_EAST_LABYRINTH — applied uniformly regardless of where the death
  // happened or which kind of "player" it was.
  private handlePlayerLikeDeath(target: PlayerLikeTarget): void {
    if (target.kind === 'dummy') {
      const dummy = target.dummy;
      const items = [...Object.values(dummy.equipment), ...dummy.inventory];
      this.corpseManager.createPlayerCorpse(dummy.username, dummy.level, dummy.mapName, dummy.row, dummy.col, items);
      const timer = setTimeout(
        () =>
          this.dummyPlayerService.respawn(dummy.id, FAR_EAST_LABYRINTH.mapName, FAR_EAST_LABYRINTH.row, FAR_EAST_LABYRINTH.col),
        PLAYER_RESPAWN_DELAY_MS
      );
      timer.unref();
      return;
    }

    const socket = target.socket;
    const victimLoc = this.worldManager.getLocation(socket.data.username);
    if (victimLoc) {
      const items = [...Object.values(socket.data.equipment), ...socket.data.inventory];
      this.corpseManager.createPlayerCorpse(socket.data.username, socket.data.level, victimLoc.mapName, victimLoc.row, victimLoc.col, items);
    }

    const expLost = socket.data.level * PLAYER_DEATH_EXP_LOSS_PER_LEVEL;
    socket.data.exp = Math.max(0, socket.data.exp - expLost);
    socket.data.equipment = {};
    socket.data.inventory = [];
    socket.data.hp = MAX_STAT;
    socket.data.respawnState = 'dead';

    this.clearCombat(socket.id);
    this.clearMurder(socket.id);

    void this.persistStats(socket.data.username, {
      hp: socket.data.hp,
      mana: socket.data.mana,
      movement: socket.data.movement,
      strength: socket.data.strength,
      intelligence: socket.data.intelligence,
      wisdom: socket.data.wisdom,
      dexterity: socket.data.dexterity,
      constitution: socket.data.constitution,
      exp: socket.data.exp,
      level: socket.data.level,
      skills: socket.data.skills,
      inventory: socket.data.inventory,
      consumeExp: socket.data.consumeExp,
      equipment: socket.data.equipment,
      gold: socket.data.gold,
      autoSacrifice: socket.data.autoSacrifice,
    });

    socket.emit('notice', {
      messages: [
        `You have been murdered! You lose ${expLost} experience. You will respawn in the far east of the Labyrinth in 15 seconds.`,
      ],
      player: victimLoc ? this.snapshotFor(socket, victimLoc) : undefined,
    });

    const timer = setTimeout(() => void this.respawnRealPlayer(socket), PLAYER_RESPAWN_DELAY_MS);
    timer.unref();
  }

  // Re-enters the world at FAR_EAST_LABYRINTH and pushes a fresh 'sync' —
  // the same shape as a normal connection's initial sync, since
  // respawning is functionally "re-entering the world at a new position."
  private async respawnRealPlayer(socket: GameSocket): Promise<void> {
    if (!socket.connected) return;

    const username = socket.data.username;
    this.worldManager.removePlayer(username);
    await this.worldManager.addPlayer(username, FAR_EAST_LABYRINTH.mapName, FAR_EAST_LABYRINTH.row, FAR_EAST_LABYRINTH.col);
    socket.data.respawnState = 'alive';

    void this.persistPosition(username, FAR_EAST_LABYRINTH);

    socket.emit('sync', {
      player: this.snapshotFor(socket, FAR_EAST_LABYRINTH),
      minimap: this.worldManager.getMinimap(username) ?? [],
      room: resolveRoom(FAR_EAST_LABYRINTH),
      monsterMessage: this.monsterMessageFor(socket, FAR_EAST_LABYRINTH),
      itemMessage: this.itemMessageFor(socket, FAR_EAST_LABYRINTH),
    });
  }

  // Fires every ATTACK_INTERVAL_MS while a murder is active for this
  // connection — the PvP equivalent of tickCombat.
  private tickMurder(client: GameSocket, targetKind: 'real' | 'dummy', targetId: string): void {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      this.clearMurder(client.id);
      return;
    }

    const target = this.getPlayerLikeById(targetKind, targetId);
    if (!target) {
      this.clearMurder(client.id);
      client.emit('combat:update', {
        messages: this.withStatusPrompt(client, ['Your target is gone.']),
        player: this.snapshotFor(client, loc),
        monsterMessage: this.monsterMessageFor(client, loc),
        itemMessage: this.itemMessageFor(client, loc),
        ended: true,
      });
      return;
    }

    const { messages, died } = this.resolveMurderExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    client.emit('combat:update', {
      messages: this.withStatusPrompt(client, messages),
      player: this.snapshotFor(client, loc),
      monsterMessage: this.monsterMessageFor(client, loc),
      itemMessage: this.itemMessageFor(client, loc),
      ended: died,
    });

    if (died) {
      this.clearMurder(client.id);
    }
  }

  // Called for every move that actually changes position (ordinary steps
  // in resolveCommandAck, and fleeing) — never for a blocked/failed move.
  // Cost is based on the room being left, not the destination.
  private deductMovementCost(client: GameSocket, departureMapName: MapName): void {
    const cost = getMap(departureMapName).setting === 'inside' ? INSIDE_MOVEMENT_COST : OUTSIDE_MOVEMENT_COST;
    client.data.movement = Math.max(0, client.data.movement - cost);
  }

  // Shared by the manual "sacrifice" command and auto-sacrifice (see
  // resolveAttackExchange): grants gold, drops the corpse's contents
  // loose on the ground (never destroyed — only a corpse's *natural*
  // expiry destroys its contents), and removes the corpse itself. Caller
  // is responsible for checking ownerType !== 'player' first — this
  // helper doesn't re-check, since auto-sacrifice only ever calls it with
  // a monster corpse it just created itself.
  private sacrificeCorpse(client: GameSocket, corpse: Corpse): number {
    const goldReward = corpse.level * SACRIFICE_GOLD_PER_LEVEL;
    client.data.gold += goldReward;
    for (const itemName of corpse.items) {
      this.itemManager.dropItem(itemName, corpse.mapName, corpse.row, corpse.col, skillForItemName(itemName));
    }
    this.corpseManager.removeCorpse(corpse.id);
    return goldReward;
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
      strength: number;
      intelligence: number;
      wisdom: number;
      dexterity: number;
      constitution: number;
      exp: number;
      level: number;
      skills: string[];
      inventory: string[];
      consumeExp: number;
      equipment: Record<string, string>;
      gold: number;
      autoSacrifice: boolean;
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
    this.clearMurder(client.id);
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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });
  }

  // "<80hp 100m 100mv>" — appended after every message batch sent to a
  // client, on every channel that carries one (typed-command acks,
  // combat:update ticks, notice pushes) via withStatusPrompt below, not
  // just typed commands. Recognized client-side by its own shape (see
  // useGameConnection's classifyServerLine) to get a bit of spacing above it.
  private statusPromptFor(client: GameSocket): string {
    return `<${client.data.hp}hp ${client.data.mana}m ${client.data.movement}mv>`;
  }

  // The second line of the prompt — every direction currently choosable,
  // reusing fleeableDirections' exact "in bounds, or a matching exit at
  // this tile" rule, so a map-to-map exit direction (e.g. "south" out of
  // the Labyrinth) is included exactly when it's actually crossable, same
  // as ordinary movement would treat it.
  private exitsLineFor(username: string): string {
    const loc = this.worldManager.getLocation(username);
    if (!loc) return 'Exits: none.';
    const labels = this.fleeableDirections(loc).map((d) => d.charAt(0).toUpperCase() + d.slice(1));
    return labels.length > 0 ? `Exits: ${labels.join(', ')}.` : 'Exits: none.';
  }

  private withStatusPrompt(client: GameSocket, messages: string[]): string[] {
    return [...messages, this.statusPromptFor(client), this.exitsLineFor(client.data.username)];
  }

  // Returning a value here becomes the ack the client's emit() callback
  // receives (Nest's built-in behavior for WS handlers with a client-side
  // acknowledgement) — no need to accept/call the raw ack function. A thin
  // wrapper around resolveCommandAck so every typed command's ack — success
  // or failure alike — gets the trailing hp/mana/movement status prompt
  // appended in exactly one place, rather than every individual handler
  // needing to remember to add it.
  @SubscribeMessage('command')
  async handleCommand(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() rawText: string
  ): Promise<CommandAck> {
    const ack = await this.resolveCommandAck(client, rawText);
    return { ...ack, messages: this.withStatusPrompt(client, ack.messages) };
  }

  private async resolveCommandAck(client: GameSocket, rawText: string): Promise<CommandAck> {
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

    // Dead players can't act at all until their 15s respawn timer fires
    // (see handlePlayerLikeDeath/respawnRealPlayer) — logout above is the
    // one exception, everything else is rejected here before dispatch.
    if (client.data.respawnState === 'dead') {
      return { ok: false, messages: ["You are dead. You'll respawn shortly."] };
    }

    // "attack"/"kill" and any of their prefixes (min 2 chars) all work —
    // "att skeleton", "ki skel", "attack skeleton" are equivalent.
    if (isAttackVerb(verb)) {
      return this.handleAttack(client, rest);
    }

    // "murder <player>" — no partials requested.
    if (verb === 'murder') {
      return this.handleMurder(client, rest);
    }

    if (text === 'flee') {
      return this.handleFlee(client);
    }

    if (matchesPartial(verb, 'consume', CONSUME_MIN_LENGTH)) {
      return this.handleConsume(client, rest);
    }

    // "grab"/"get" and any prefix down to "g" — same handler either way.
    if (isGrabVerb(verb)) {
      return this.handleGrab(client, rest);
    }

    if (verb === 'drop') {
      return this.handleDrop(client, rest);
    }

    // "unequip" and "remove"/"rem"/"remo"/"remov" are two spellings of
    // the same action.
    if (verb === 'unequip' || matchesPartial(verb, 'remove', REMOVE_MIN_LENGTH)) {
      return this.handleUnequip(client, rest);
    }

    // Covers "eq"/"equ"/"equi"/"equip"/... and "equipment"/its own
    // partials in one check (see EQUIP_MIN_LENGTH) — an item argument
    // means "equip <item>", no argument means "show my equipment slots".
    // "wear" is a third spelling of the same action (equip only, no
    // partials requested for it, and no separate bare-argument meaning —
    // "wear" alone still just falls into the equipment-view fallback).
    if (matchesPartial(verb, 'equipment', EQUIP_MIN_LENGTH) || verb === 'wear') {
      return rest ? this.handleEquip(client, rest) : this.handleEquipmentView(client);
    }

    if (matchesPartial(verb, 'where', WHERE_MIN_LENGTH)) {
      return this.handleWhere(client, rest);
    }

    if (matchesPartial(verb, 'examine', EXAMINE_MIN_LENGTH)) {
      return this.handleExamine(client, rest);
    }

    // Bare command, no argument — "inv", "inven", "inventory", ...
    if (matchesPartial(text, 'inventory', INVENTORY_MIN_LENGTH)) {
      return this.handleInventory(client);
    }

    if (matchesPartial(text, 'skills', SKILLS_MIN_LENGTH)) {
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
    // With an argument, "look <x>" is just an alias for "examine <x>" —
    // without one, it's the bare room-summary behavior it's always had.
    if (verb === 'look' || verb === 'l') {
      return rest ? this.handleExamine(client, rest) : this.handleLook(client);
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

    // "who" — no partials requested, literal only.
    if (text === 'who') {
      return this.handleWho(client);
    }

    // "help <argument>" — the verb itself is exact-match only; the
    // argument is what partially matches (see findHelpTopic).
    if (verb === 'help') {
      return this.handleHelp(client, rest);
    }

    // "sacrifice" — no partials requested, literal only.
    if (text === 'sacrifice') {
      return this.handleSacrifice(client);
    }

    // "auto" (bare) shows the toggle list; "auto sac"/"auto sacrifice"
    // toggles it — see handleAuto for the argument's own partial match.
    if (verb === 'auto') {
      return this.handleAuto(client, rest);
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
    // while activeCombats or activeMurders has an entry for this connection.
    if (this.activeCombats.has(client.id) || this.activeMurders.has(client.id)) {
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

    const fromLoc = this.worldManager.getLocation(username);
    const fromMap = fromLoc?.mapName ?? 'the world';
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
      if (fromLoc) {
        this.deductMovementCost(client, fromLoc.mapName);
      }
      // Not awaited — a background save shouldn't add latency to the
      // command ack. Also saved on disconnect (persistPosition above), so
      // this is about surviving a hard crash between moves, not the
      // primary persistence path.
      void this.persistPosition(username, loc);
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
      });
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
      // "kill"/"attack" should not work on players — if the name actually
      // matches a player here, say so explicitly rather than the generic
      // "not found" (which would otherwise look like a typo on their part).
      if (this.findPlayerLikeAt(client, loc.worldId, loc.mapName, loc.row, loc.col, mobQuery)) {
        return buildAck(['You cannot attack another player. Use "murder <player>" instead.'], false);
      }
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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
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

  // "murder <player>" — the only way to attack another player (real or
  // dummy); "attack"/"kill" refuse player targets entirely (see
  // handleAttack's own guard). No partial matching requested. Otherwise
  // mirrors handleAttack's shape exactly: swing immediately, then an
  // auto-attack loop (tickMurder) every ATTACK_INTERVAL_MS until the
  // target dies or the attacker flees.
  private async handleMurder(client: GameSocket, targetQuery: string): Promise<CommandAck> {
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

    if (!targetQuery) {
      return buildAck(['Murder whom?'], false);
    }

    const target = this.findPlayerLikeAt(client, loc.worldId, loc.mapName, loc.row, loc.col, targetQuery);
    if (!target) {
      return buildAck([`There is no "${targetQuery}" here to murder.`], false);
    }

    const targetId = target.kind === 'real' ? target.socket.id : target.dummy.id;
    const targetName = target.kind === 'real' ? target.socket.data.username : target.dummy.username;

    const existing = this.activeMurders.get(client.id);
    if (existing && existing.targetId === targetId) {
      const hp = target.kind === 'real' ? target.socket.data.hp : target.dummy.hp;
      const maxHp = target.kind === 'real' ? MAX_STAT : target.dummy.maxHp;
      return buildAck(
        [
          `You are already attacking ${targetName}.`,
          `${targetName} has ${Math.max(0, Math.round((hp / maxHp) * 100))}% HP remaining.`,
        ],
        true
      );
    }

    // Can't be fighting a monster and murdering a player at once;
    // redirecting to a new target cancels whatever murder was running.
    this.clearCombat(client.id);
    this.clearMurder(client.id);

    const { messages, died } = this.resolveMurderExchange(client, target);
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    if (died) {
      return buildAck(messages, true);
    }

    const timer = setInterval(() => this.tickMurder(client, target.kind, targetId), ATTACK_INTERVAL_MS);
    timer.unref();
    this.activeMurders.set(client.id, { timer, targetKind: target.kind, targetId });

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

    if (!this.activeCombats.has(client.id) && !this.activeMurders.has(client.id)) {
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
    this.clearMurder(client.id);

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
      this.deductMovementCost(client, loc.mapName);
      void this.persistPosition(username, newLoc);
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
      });
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
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    return buildAck(messages, true);
  }

  // "grab"/"get <item>" — same partial-name matching as consume, but adds
  // the item to the player's permanent inventory instead of eating it.
  // Checks the ground first, then (if there's a corpse in the room) its
  // contents — "should be able to get items from the corpse."
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

    const persistAfterGrab = (): void => {
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
      });
    };

    const item = this.itemManager.findItemByNameAt(loc.mapName, loc.row, loc.col, itemQuery);
    if (item) {
      this.itemManager.removeItem(item.id);
      client.data.inventory = [...client.data.inventory, item.name];
      persistAfterGrab();
      return buildAck([`You pick up the ${item.name}.`], true);
    }

    const corpseMatch = this.corpseManager.findItemInCorpseAt(loc.mapName, loc.row, loc.col, itemQuery);
    if (corpseMatch) {
      this.corpseManager.removeItemFromCorpse(corpseMatch.corpse.id, corpseMatch.itemName);
      client.data.inventory = [...client.data.inventory, corpseMatch.itemName];
      persistAfterGrab();
      return buildAck([`You take the ${corpseMatch.itemName} from the corpse.`], true);
    }

    return buildAck([`There is no "${itemQuery}" here to grab.`], false);
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

    // If there's a corpse here, dropping puts the item *into* it ("put
    // items back in") rather than loose on the ground.
    const corpse = this.corpseManager.getCorpseAt(loc.mapName, loc.row, loc.col);
    if (corpse) {
      this.corpseManager.addItemToCorpse(corpse.id, itemName);
    } else {
      this.itemManager.dropItem(itemName, loc.mapName, loc.row, loc.col, skillForItemName(itemName));
    }

    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    return buildAck([corpse ? `You put the ${itemName} into the corpse.` : `You drop the ${itemName}.`], true);
  }

  // "equip <item>" — partial, case-insensitive match against inventory
  // (same style as drop). Only items with an EquipmentDefinition (see
  // items/item-definitions.ts) can be equipped at all — right now that's
  // just "bone dagger" (the 'weapon' slot); everything else (body parts,
  // or any item with no definition) is rejected. Equipping into an
  // already-occupied slot swaps: whatever was there goes back into
  // inventory rather than being lost.
  private async handleEquip(client: GameSocket, itemQuery: string): Promise<CommandAck> {
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
      return buildAck(['Equip what?'], false);
    }

    const needle = itemQuery.toLowerCase();
    const itemName = client.data.inventory.find((name) => name.toLowerCase().includes(needle));
    if (!itemName) {
      return buildAck([`You aren't carrying a "${itemQuery}".`], false);
    }

    const definition = equipmentForItemName(itemName);
    if (!definition) {
      return buildAck([`You can't equip the ${itemName}.`], false);
    }

    const index = client.data.inventory.indexOf(itemName);
    client.data.inventory = [...client.data.inventory.slice(0, index), ...client.data.inventory.slice(index + 1)];

    const slot: EquipmentSlot = definition.slot;
    const previousItem = client.data.equipment[slot];
    client.data.equipment = { ...client.data.equipment, [slot]: itemName };
    if (previousItem) {
      client.data.inventory = [...client.data.inventory, previousItem];
    }

    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    const messages = previousItem
      ? [`You equip the ${itemName}, replacing the ${previousItem}.`]
      : [`You equip the ${itemName}.`];

    return buildAck(messages, true);
  }

  // "unequip <item>" — the inverse of equip: partial, case-insensitive
  // match against what's currently *equipped* (not inventory), empties
  // that slot, and returns the item to inventory.
  private async handleUnequip(client: GameSocket, itemQuery: string): Promise<CommandAck> {
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
      return buildAck(['Unequip what?'], false);
    }

    const needle = itemQuery.toLowerCase();
    const match = Object.entries(client.data.equipment).find(([, itemName]) => itemName.toLowerCase().includes(needle));
    if (!match) {
      return buildAck([`You don't have a "${itemQuery}" equipped.`], false);
    }

    const [slot, itemName] = match;
    const { [slot]: _removed, ...remainingEquipment } = client.data.equipment;
    client.data.equipment = remainingEquipment;
    client.data.inventory = [...client.data.inventory, itemName];

    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    return buildAck([`You unequip the ${itemName}.`], true);
  }

  // "equip"/"equipment" (or any of their shared partials, see
  // EQUIP_MIN_LENGTH) typed with no item argument — every slot, head to
  // toe, with whatever's equipped there or "(empty)".
  private handleEquipmentView(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = equipmentLines('Your equipment:', client.data.equipment);

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

  // Purely informational — no state change, so unlike every other handler
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

  // "look"/"l" — re-announces the current room's monster(s), item(s), and
  // any other players exactly as if the player had just stepped into it,
  // bypassing the "only when it's genuinely new" dedup the client applies
  // to monsterMessage/itemMessage (see useGameConnection's withSightings):
  // these lines are sent as ordinary messages, not just the monsterMessage
  // /itemMessage fields, so they always print in the log regardless of
  // whether anything changed since the last look. Suppressed entirely
  // while sleeping, same as monsterMessageFor/itemMessageFor.
  private handleLook(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, messages: ['Your session was lost. Please reconnect.'] };
    }

    const monsterMessage = this.monsterMessageFor(client, loc);
    // itemMessage (below, for the ack's sighting-dedup field) stays one
    // combined sentence — but the log lines "look" actually prints break
    // out each unique item onto its own line (see groupedItemLines), which
    // is also what makes a second item dropped in the same kill (e.g. a
    // bone dagger alongside a body part) visible rather than only ever
    // showing whichever item happened to be first.
    const itemMessage = this.itemMessageFor(client, loc);
    const messages: string[] = [];
    if (monsterMessage) messages.push(monsterMessage);

    if (client.data.restState !== 'sleeping') {
      messages.push(...groupedItemLines(this.itemManager.getItemsAt(loc.mapName, loc.row, loc.col)));

      const corpseLine = this.corpseLineFor(loc);
      if (corpseLine) messages.push(corpseLine);

      const others = this.otherPlayersAt(client, loc.worldId, loc.mapName, loc.row, loc.col);
      if (others.length === 1) {
        messages.push(`${others[0]} is here!`);
      } else if (others.length > 1) {
        messages.push(`${others.join(', ')} are here!`);
      }
    }

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
  // never leaving the current map) and reports which have a monster
  // and/or other players in them. Spotted names are wrapped in `**...**`,
  // which the client renders as a highlighted white span (see
  // GameScreen's renderMessageText) — the same lightweight convention any
  // future message could reuse. A direction that would fall off the map's
  // edge is skipped entirely rather than reported on — there's no room
  // there to scan.
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
      const others = this.otherPlayersAt(client, loc.worldId, loc.mapName, row, col);

      const parts: string[] = [];
      if (monster) {
        parts.push(`A **${monster.kind}** is here!`);
      }
      if (others.length === 1) {
        parts.push(`**${others[0]}** is here!`);
      } else if (others.length > 1) {
        parts.push(`${others.map((o) => `**${o}**`).join(', ')} are here!`);
      }

      messages.push(parts.length > 0 ? `${label}: ${parts.join(' ')}` : `${label}: Nothing of note.`);
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
  // level, attributes, hp, mana, movement, exp, consumeExp), same labels
  // and order as the box. Purely informational, same as skills/inventory/map.
  private handleScore(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const messages = [
      username,
      `RACE: ${client.data.race}`,
      `LVL: ${client.data.level}`,
      `STR: ${client.data.strength}`,
      `INT: ${client.data.intelligence}`,
      `WIS: ${client.data.wisdom}`,
      `DEX: ${client.data.dexterity}`,
      `CON: ${client.data.constitution}`,
      `HP: ${client.data.hp}`,
      `MP: ${client.data.mana}`,
      `MV: ${client.data.movement}`,
      `XP: ${client.data.exp}`,
      `CXP: ${client.data.consumeExp}`,
      `GOLD: ${client.data.gold}`,
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

  // Every other connected player standing in this exact cell — used by
  // "look" (same room) and "scan" (adjacent rooms). Requires the same
  // worldId, not just the same map/row/col: two players on the same map
  // but in different overflow shards are simulated independently and
  // shouldn't see each other, even if their coordinates coincide. Dummy
  // players (see DummyPlayerService) aren't sharded at all — they're
  // matched by map/row/col alone, same as monsters.
  private otherPlayersAt(client: GameSocket, worldId: string, mapName: MapName, row: number, col: number): string[] {
    const results: string[] = [];
    for (const other of this.server.sockets.sockets.values()) {
      if (other.id === client.id) continue;
      const otherLoc = this.worldManager.getLocation(other.data.username);
      if (otherLoc && otherLoc.worldId === worldId && otherLoc.mapName === mapName && otherLoc.row === row && otherLoc.col === col) {
        results.push(other.data.username);
      }
    }
    for (const dummy of this.dummyPlayerService.getAll()) {
      if (dummy.mapName === mapName && dummy.row === row && dummy.col === col) {
        results.push(dummy.username);
      }
    }
    return results;
  }

  // Same cell/scope as otherPlayersAt, but returns a normalized reference
  // to whichever kind of "player" matched a partial, case-insensitive
  // query — a real connected socket or a dummy player — used by "examine
  // <player>" and "murder <player>", both of which need full data (level,
  // equipment, attributes) from either source, not just a name.
  private findPlayerLikeAt(
    client: GameSocket,
    worldId: string,
    mapName: MapName,
    row: number,
    col: number,
    query: string
  ): PlayerLikeTarget | undefined {
    const needle = query.toLowerCase();
    for (const other of this.server.sockets.sockets.values()) {
      if (other.id === client.id) continue;
      if (!other.data.username.toLowerCase().includes(needle)) continue;
      const otherLoc = this.worldManager.getLocation(other.data.username);
      if (otherLoc && otherLoc.worldId === worldId && otherLoc.mapName === mapName && otherLoc.row === row && otherLoc.col === col) {
        return { kind: 'real', socket: other };
      }
    }
    const dummy = this.dummyPlayerService.findAt(mapName, row, col, query);
    return dummy ? { kind: 'dummy', dummy } : undefined;
  }

  // Every other connected player sharing this player's actual World
  // instance (WorldManagerService's worldId — the worker_thread-sharded
  // concept, not just "same map name": two players on the same map but in
  // different overflow shards aren't in the same World). Self is always
  // excluded — "where" reporting your own room back to you isn't useful.
  // Dummy players are matched by map alone (see otherPlayersAt).
  private otherPlayersInWorld(
    client: GameSocket,
    worldId: string
  ): Array<{ username: string; mapName: MapName; row: number; col: number }> {
    const results: Array<{ username: string; mapName: MapName; row: number; col: number }> = [];
    for (const other of this.server.sockets.sockets.values()) {
      if (other.id === client.id) continue;
      const otherLoc = this.worldManager.getLocation(other.data.username);
      if (otherLoc && otherLoc.worldId === worldId) {
        results.push({ username: other.data.username, mapName: otherLoc.mapName, row: otherLoc.row, col: otherLoc.col });
      }
    }
    const worldMapName = this.worldManager.getLocation(client.data.username)?.mapName;
    if (worldMapName) {
      for (const dummy of this.dummyPlayerService.getAll()) {
        if (dummy.mapName === worldMapName) {
          results.push({ username: dummy.username, mapName: dummy.mapName, row: dummy.row, col: dummy.col });
        }
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
      const messages = [
        'Players nearby:',
        ...others.map((o) => `${o.username} is in ${getRoomName(o.mapName, o.row, o.col)}.`),
      ];
      return buildAck(messages, true);
    }

    const target = this.monsterManager.findMonsterByName(mobQuery);
    if (target && target.mapName === loc.mapName) {
      return buildAck([`The ${target.kind} is in ${getRoomName(target.mapName, target.row, target.col)}.`], true);
    }

    const needle = mobQuery.toLowerCase();
    const matchedPlayer = this.otherPlayersInWorld(client, loc.worldId).find((o) =>
      o.username.toLowerCase().includes(needle)
    );
    if (matchedPlayer) {
      return buildAck(
        [`${matchedPlayer.username} is in ${getRoomName(matchedPlayer.mapName, matchedPlayer.row, matchedPlayer.col)}.`],
        true
      );
    }

    return buildAck(['That monster was not found.'], false);
  }

  // "examine <argument>" ("exa" through "examine") — also reachable as
  // "look <argument>"/"l <argument>" (see the dispatch site), which is
  // otherwise the bare room-summary command. Checked in priority order: a
  // monster in the room, another player in the room, a dropped item in
  // the room, an item in inventory, then the room itself (if the query
  // matches "room"). Examining a player or monster also shows their
  // equipment slots and a level-based power-comparison message (see
  // powerComparisonMessage) — items/room just get their description.
  private handleExamine(client: GameSocket, query: string): CommandAck {
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

    if (!query) {
      return buildAck(['Examine what?'], false);
    }

    const monster = this.monsterManager.findMonsterByNameAt(loc.mapName, loc.row, loc.col, query);
    if (monster) {
      return buildAck(
        [
          monsterDescriptionFor(monster.kind),
          powerComparisonMessage(client.data.level, monster.level, `The ${monster.kind}`),
          ...equipmentLines(`The ${monster.kind}'s equipment:`, {}),
        ],
        true
      );
    }

    const playerLike = this.findPlayerLikeAt(client, loc.worldId, loc.mapName, loc.row, loc.col, query);
    if (playerLike) {
      const other = playerLike.kind === 'real' ? playerLike.socket.data : playerLike.dummy;
      return buildAck(
        [
          `${other.username} is a level ${other.level} ${other.race}.`,
          powerComparisonMessage(client.data.level, other.level, other.username),
          ...equipmentLines(`${other.username}'s equipment:`, other.equipment),
        ],
        true
      );
    }

    const groundItem = this.itemManager.findItemByNameAt(loc.mapName, loc.row, loc.col, query);
    if (groundItem) {
      return buildAck([itemDescriptionFor(groundItem.name) ?? `A ${groundItem.name}.`], true);
    }

    const needle = query.toLowerCase();
    const invName = client.data.inventory.find((n) => n.toLowerCase().includes(needle));
    if (invName) {
      return buildAck([itemDescriptionFor(invName) ?? `A ${invName}.`], true);
    }

    if ('room'.includes(needle)) {
      const room = resolveRoom(loc);
      return buildAck([room.name, room.description], true);
    }

    return buildAck([`You don't see any "${query}" here.`], false);
  }

  // "sacrifice" — offers a monster corpse in the room to the gods for
  // gold (see sacrificeCorpse); player corpses are explicitly refused, no
  // matter what. See also autoSacrifice, which does this automatically
  // right after a kill instead of requiring this command.
  private handleSacrifice(client: GameSocket): CommandAck {
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

    const corpse = this.corpseManager.getCorpseAt(loc.mapName, loc.row, loc.col);
    if (!corpse) {
      return buildAck(['There is no corpse here to sacrifice.'], false);
    }
    if (corpse.ownerType === 'player') {
      return buildAck(["You cannot sacrifice a player's corpse."], false);
    }

    const goldReward = this.sacrificeCorpse(client, corpse);
    void this.persistStats(username, {
      hp: client.data.hp,
      mana: client.data.mana,
      movement: client.data.movement,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      exp: client.data.exp,
      level: client.data.level,
      skills: client.data.skills,
      inventory: client.data.inventory,
      consumeExp: client.data.consumeExp,
      equipment: client.data.equipment,
      gold: client.data.gold,
      autoSacrifice: client.data.autoSacrifice,
    });

    return buildAck(
      [`You sacrifice the ${corpse.label}'s corpse to the gods, receiving ${goldReward} gold coin${goldReward === 1 ? '' : 's'}.`],
      true
    );
  }

  // "auto" (bare) shows every togglable automation and its current
  // on/off state — right now just "sacrifice" (see SocketData
  // .autoSacrifice). "auto sac"/"auto sacrifice" (partial-matched
  // against the toggle's own name, not the "auto" verb) flips it. The
  // client mirrors this as a shaded ("on") or unshaded ("off") tile in
  // its own Auto box, driven by PlayerSnapshot.autoSacrifice.
  private handleAuto(client: GameSocket, argument: string): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const buildAck = (messages: string[], ok: boolean): CommandAck => ({
      ok,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    });

    if (!argument) {
      return buildAck([`Auto-toggles: sacrifice [${client.data.autoSacrifice ? 'ON' : 'OFF'}]`], true);
    }

    if (matchesPartial(argument.toLowerCase(), 'sacrifice', AUTO_TOGGLE_MIN_LENGTH)) {
      client.data.autoSacrifice = !client.data.autoSacrifice;
      void this.persistStats(username, {
        hp: client.data.hp,
        mana: client.data.mana,
        movement: client.data.movement,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
      });
      return buildAck([`Auto-sacrifice is now ${client.data.autoSacrifice ? 'ON' : 'OFF'}.`], true);
    }

    return buildAck([`Unknown auto-toggle: "${argument}".`], false);
  }

  // "who" — every connected player server-wide (not scoped to the same
  // map/World instance like "where"'s bare form), self included, since
  // "who's online" naturally covers you too.
  private handleWho(client: GameSocket): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const usernames = Array.from(this.server.sockets.sockets.values()).map((s) => s.data.username);
    const dummyUsernames = this.dummyPlayerService.getAll().map((d) => d.username);
    const messages = ['Players online:', ...usernames, ...dummyUsernames];

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

  // "help <argument>" — partial, case-insensitive match against known
  // help topics (see help/help-topics.ts). The verb itself must be typed
  // in full; only the argument partially matches.
  private handleHelp(client: GameSocket, query: string): CommandAck {
    const { username } = client.data;
    const loc = this.worldManager.getLocation(username);

    const buildAck = (messages: string[], ok: boolean): CommandAck => ({
      ok,
      messages,
      player: loc ? this.snapshotFor(client, loc) : undefined,
      minimap: this.worldManager.getMinimap(username),
      room: loc ? resolveRoom(loc) : undefined,
      monsterMessage: loc ? this.monsterMessageFor(client, loc) : undefined,
      itemMessage: loc ? this.itemMessageFor(client, loc) : undefined,
    });

    if (!query) {
      return buildAck(['Help with what? Try "help <topic>".'], false);
    }

    const found = findHelpTopic(query);
    if (!found) {
      return buildAck([`No help found for "${query}".`], false);
    }

    return buildAck([`${found.topic}: ${found.description}`], true);
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
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        exp: client.data.exp,
        level: client.data.level,
        skills: client.data.skills,
        inventory: client.data.inventory,
        consumeExp: client.data.consumeExp,
        equipment: client.data.equipment,
        gold: client.data.gold,
        autoSacrifice: client.data.autoSacrifice,
      });

      const lead =
        client.data.restState === 'sleeping'
          ? 'You stir in your sleep'
          : client.data.restState === 'resting'
            ? 'You rest quietly'
            : 'You catch your breath';

      client.emit('notice', {
        messages: this.withStatusPrompt(client, [`${lead}, recovering ${hpGain} HP, ${manaGain} MP, and ${movementGain} MV.`]),
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
      'murder <player> - attack another player (real or a test dummy) in your room',
      'flee - break off a fight and flee in a random direction',
      'consume <item> - eat an item (on the ground, or in your inventory) for a chance at a skill',
      'grab/get <item> - pick up a dropped item into your inventory',
      'drop <item> - drop an item from your inventory onto the ground',
      'equip/wear <item> - equip an item from your inventory into its equipment slot',
      'equip/equipment (no item) - show your equipment slots, head to toe',
      'unequip/remove <item> - unequip an item, returning it to your inventory',
      'examine <item, player, monster, or room> - see a description (and equipment, for a player/monster)',
      'where [mob or player] - list nearby players, or locate a monster/player by name',
      'who - list every player currently online',
      'help <topic> - look up a description of a skill or other topic',
      'sacrifice - offer a monster corpse in the room to the gods for gold',
      'auto - show your togglable automations, or "auto sac" to toggle auto-sacrifice',
      'inventory - show what you are carrying',
      'skills - show your learned skills',
      'look/l - look around the room again',
      'look/l <item, player, monster, or room> - same as "examine"',
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
