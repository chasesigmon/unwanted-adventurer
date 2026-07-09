import type { Server, Socket } from 'socket.io';
import type { MapName, Race, Direction, MonsterKind } from './constants.js';

// Never persisted across sessions (a fresh connection always starts
// 'awake') — matches the text game's own restState, which the same
// heal-percent-per-tick range and sleep/rest/wake commands key off.
export type RestState = 'awake' | 'resting' | 'sleeping';

export interface PlayerSnapshot {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  consumeExp: number;
  restState: RestState;
}

// A static (never-moving) map occupant — the "test/dummy" skeleton in the
// Great Plains today; same shape a wandering NPC could reuse later. Has
// the same stats as a real player (see combat/formulas.ts's starting
// values) since it's a real target for the punch/combat system too.
export interface NpcSnapshot {
  id: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  hp: number;
  maxHp: number;
}

// A wild monster — wanders on its own, has no account/login, and is a
// valid punch/combat target like an NPC or another player.
export interface MonsterSnapshot {
  id: string;
  kind: MonsterKind;
  map: MapName;
  row: number;
  col: number;
  level: number;
  hp: number;
  maxHp: number;
}

// Left behind when a monster or a real player dies (not the training
// dummy — it just resets, there's no "kill" to leave remains from).
// Usually just a body part, but some monsters (a wild skeleton with a
// carried weapon) can drop more than one item; looting takes everything
// at once and removes the corpse.
export interface CorpseSnapshot {
  id: string;
  kind: Race | MonsterKind;
  items: string[];
  map: MapName;
  row: number;
  col: number;
}

export interface SyncPayload {
  player: PlayerSnapshot;
}

// Broadcast to everyone in a map's room whenever anyone joins, moves
// within it, or leaves — the client's only source of truth for rendering
// other players/NPCs/monsters/corpses (and thus for knowing which tiles
// are occupied).
export interface MapStatePayload {
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
  monsters: MonsterSnapshot[];
  corpses: CorpseSnapshot[];
}

// Broadcast to a map's room whenever a punch actually lands on a target
// (an NPC/monster/other player standing exactly one tile ahead, in the
// direction thrown) — carries enough to update everyone's view of the
// fight (health bars, a combat log line) without waiting for the next
// map:state.
export interface CombatEventPayload {
  attacker: string;
  attackerLevel: number;
  attackerExp: number;
  attackerHp: number;
  attackerMaxHp: number;
  targetKind: 'player' | 'npc' | 'monster';
  target: string;
  targetLabel: string;
  damage: number;
  targetHp: number;
  targetMaxHp: number;
  targetDied: boolean;
  expGained?: number;
  leveledUp?: boolean;
  message: string;
  // Attacker's own weapon-skill growth (punch, or dagger while wielding
  // one), plus the defender's dodge/parry/shield-block growth when their
  // avoidance actually triggered/was attempted — each a standalone line
  // for the combat log, same message shape for every skill.
  growthMessages?: string[];
}

export interface MoveAck {
  ok: boolean;
  player: PlayerSnapshot;
  // Set when ok is false (e.g. walked into the world's edge, or the tile
  // is occupied by another player/NPC) or on a map transition (e.g. "You
  // enter the Labyrinth.") — purely cosmetic, the client doesn't have to
  // show it.
  message?: string;
}

export interface KickedPayload {
  message: string;
}

export interface PunchPayload {
  username: string;
  direction: Direction;
}

export interface LootAck {
  ok: boolean;
  inventory?: string[];
  message?: string;
}

export interface UseItemAck {
  ok: boolean;
  action?: 'consumed' | 'equipped';
  inventory?: string[];
  equipment?: Record<string, string>;
  consumeExp?: number;
  skills?: Record<string, number>;
  message?: string;
}

// Local (map-scoped) chat — broadcast only to the room for `map`, so a
// player in the Labyrinth never sees a chat line sent from the Great
// Plains, and vice versa.
export interface ChatPayload {
  username: string;
  map: MapName;
  message: string;
}

export interface WhoEntry {
  username: string;
  map: MapName;
  level: number;
}

export interface WhoAck {
  players: WhoEntry[];
}

// A periodic passive-regen tick (see game.gateway.ts's stat-tick timer) —
// deliberately its own lightweight event rather than reusing 'sync',
// since 'sync' also forces the client to reset any in-progress move/punch
// animation, which a purely-passive background regen tick shouldn't do.
export interface StatTickPayload {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
  'map:state': (data: MapStatePayload) => void;
  punch: (data: PunchPayload) => void;
  combat: (data: CombatEventPayload) => void;
  chat: (data: ChatPayload) => void;
  statTick: (data: StatTickPayload) => void;
}

export interface ClientToServerEvents {
  move: (direction: Direction, ack: (res: MoveAck) => void) => void;
  // Also resolves combat server-side: if a punch in this direction lands
  // on an NPC/monster/player standing exactly one tile ahead, damage is
  // applied and a 'combat' event is broadcast — no separate "attack"
  // event needed, the direction alone is enough.
  punch: (direction: Direction) => void;
  loot: (corpseId: string, ack: (res: LootAck) => void) => void;
  // Grabs a single item out of a corpse by index (the corpse loot modal's
  // "click one item" path) rather than everything at once — the corpse
  // itself is removed once its last item is taken.
  lootItem: (payload: { corpseId: string; itemIndex: number }, ack: (res: LootAck) => void) => void;
  // Clicking an inventory item: the server decides consume vs. equip
  // based on the item itself (see combat/formulas.ts's
  // EQUIPMENT_SLOT_FOR_ITEM) so the client never has to know which items
  // are equippable.
  useItem: (itemIndex: number, ack: (res: UseItemAck) => void) => void;
  // Fire-and-forget, same as punch — the server trims/validates/length-
  // caps and rebroadcasts to the sender's own map room only.
  chat: (message: string) => void;
  who: (ack: (res: WhoAck) => void) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  exp: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  consumeExp: number;
  restState: RestState;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
