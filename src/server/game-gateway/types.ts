import type { Server, Socket } from 'socket.io';
import type { PlayerSnapshot, MinimapCell, RoomInfo, WorldMapArea } from '../../shared/types.js';
import type { Race } from '../../shared/constants.js';

export interface SyncPayload {
  player: PlayerSnapshot;
  minimap: MinimapCell[];
  room: RoomInfo;
  // Present whenever the player's current cell has a monster in it, e.g.
  // "A skeleton is here!" — omitted otherwise.
  monsterMessage?: string;
  // Same idea, for a dropped item (e.g. "A leg lies here.") — omitted
  // otherwise. See ItemManagerService.
  itemMessage?: string;
}

export interface KickedPayload {
  message: string;
}

export interface CommandAck {
  ok: boolean;
  // One or more lines to append to the client's persistent message log
  // (never a replacement — the log only grows or is explicitly cleared by
  // the client-side "clear" command). A combat exchange is often more than
  // one line: e.g. ["You hit the skeleton for 6 damage!", "The skeleton has
  // 70% HP remaining.", "The skeleton hits you for 2 damage."]. Sightings
  // (monsterMessage/itemMessage below) are folded into this same log by
  // the client — nothing here needs a name/hp-percent status field of its
  // own; every transient bit of information is just another log line.
  messages: string[];
  player?: PlayerSnapshot;
  minimap?: MinimapCell[] | null;
  room?: RoomInfo;
  // Always sent alongside `room` (never independently) — its absence when
  // `room` is present means "no monster here", not "unknown". The client
  // only turns this into a log line when it's a genuinely new sighting
  // (different from what it last saw), not on every single ack.
  monsterMessage?: string;
  // Same "always alongside room" rule as monsterMessage, for a dropped item.
  itemMessage?: string;
  // Present only on the "worldmap" command's ack — the client opens a
  // modal when it sees this rather than logging it as a message line.
  worldMap?: WorldMapArea[];
  loggedOut?: boolean;
}

// Pushed roughly every 4 seconds while an "attack <mob>" loop is running
// for this connection, without the client sending anything — see
// GameGateway's activeCombats/tickCombat. `ended` is true on the final
// push for a given fight (a kill, in practice always — the target can't
// wander off mid-fight, see MonsterManagerService.setEngaged).
export interface CombatUpdatePayload {
  messages: string[];
  player: PlayerSnapshot;
  monsterMessage?: string;
  itemMessage?: string;
  ended: boolean;
}

// Pushed outside of any command ack, for events the server originates on
// its own timers rather than in response to something the client sent —
// a monster wandering into/out of the player's room (see
// MonsterManagerService's 'moved' event) or a passive stat-regen tick (see
// GameGateway.statTick). `player` is only present when stats actually
// changed (the regen tick); `monsterMessage` is only present for a
// monster-movement notice, and is the authoritative post-move value (so
// the client's own dedup state — see useGameConnection's withSightings —
// stays in sync for next time).
export interface NoticePayload {
  messages: string[];
  player?: PlayerSnapshot;
  // `null` (not just omitted) means "authoritatively nothing here now" —
  // omitted entirely means this notice doesn't carry room info at all
  // (a heal tick). The client's dedup state only updates in the former
  // case; see useGameConnection's 'notice' reducer case.
  monsterMessage?: string | null;
}

// "say <message>" — broadcast server-wide (see GameGateway.handleSay) to
// every connected socket, sender included, rather than folded into any
// single command's own ack — that's what lets every other online player
// see it live, not just whoever typed it. The client renders it in yellow
// in the main log (see GameScreen's classifyServerLine-equivalent) and
// separately appends it to the persistent chat panel.
export interface ChatPayload {
  username: string;
  message: string;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
  'combat:update': (data: CombatUpdatePayload) => void;
  notice: (data: NoticePayload) => void;
  chat: (data: ChatPayload) => void;
}

export interface ClientToServerEvents {
  command: (text: string, ack: (res: CommandAck) => void) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  username: string;
  // Set once at connection time and never changed thereafter (race isn't
  // something a player can alter after registration).
  race: Race;
  // Base attributes — fixed at 1, no allocation/leveling mechanic yet.
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  // Cached from Mongo at connection time. Nothing changes these mid-session
  // yet, so re-reading from the DB on every command would be wasted work —
  // this is the seam where per-session stat mutation would plug in later.
  hp: number;
  mana: number;
  movement: number;
  // Everyone starts at 100 (MAX_STAT) — only permanently raised by
  // evolving (see GameGateway.maybeEvolveToHobgoblin). A level-up heals to
  // these, it never raises them itself.
  maxHp: number;
  maxMana: number;
  maxMovement: number;
  exp: number;
  level: number;
  // Permanent abilities, keyed by name with a 1-100 percentage value — see
  // players/skills.ts.
  skillLevels: Record<string, number>;
  inventory: string[];
  consumeExp: number;
  // "kick"/"slap" (whichever active skill the player's race has — see
  // players/skills.ts) queues rather than firing immediately (see
  // GameGateway.processQueuedActiveSkill) — never persisted, reset to 0 on
  // a fresh connection; combat-transient state, same as restState/
  // respawnState.
  queuedActiveSkillUses: number;
  // Earned via "sacrifice" (manual or automatic).
  gold: number;
  // Toggled via "auto sac"/"auto sacrifice" — a standing preference
  // (persisted), unlike restState.
  autoSacrifice: boolean;
  // Toggled via "auto con"/"auto consume" — a standing preference
  // (persisted), same as autoSacrifice.
  autoConsume: boolean;
  // 'dead' only between being murdered and the 15s respawn timer firing
  // (see GameGateway.respawnPlayer) — while dead, commands are rejected
  // rather than let the player act (move, fight, etc.) from a corpse.
  // Never persisted; always 'alive' on a fresh connection.
  respawnState: 'alive' | 'dead';
  // Populated via "equip <item>" — see items/item-definitions.ts for the
  // full EquipmentSlot list and which items map to which slot/category.
  // Only occupied slots are present as keys. Keyed loosely as
  // Record<string, string> (matching PlayerStats/updateStats, which
  // persists this as a plain object) rather than
  // Partial<Record<EquipmentSlot, string>> — callers that need the
  // stricter slot type get it from EquipmentDefinition.slot instead.
  equipment: Record<string, string>;
  // Toggled by "sleep"/"rest"/"sit"/"wake"/"stand" — never persisted
  // (always 'awake' on a fresh connection). A per-connection tick always
  // runs (see GameGateway.statTick) regenerating a random percentage of
  // hp/mana/movement every 20-30s regardless of state, but the percentage
  // range — and whether monsterMessageFor/itemMessageFor report anything
  // at all — depends on which of these three states the player is in.
  restState: 'awake' | 'resting' | 'sleeping';
  // Slime-only ("mimic"/"revert" — see players/skills.ts). Which race or
  // monster kind a slime is currently disguised as, defaulting to (and
  // only ever meaningful when equal to) 'slime' for every other race —
  // see items/item-definitions.ts's allowedSlotsForRace.
  form: string;
  // Slime-only — every unique race/monster-kind name ever consumed (see
  // items/item-definitions.ts's bodyPartSourceName), i.e. what "mimic"
  // (bare) lists and what "mimic <name>" can match against.
  mimicForms: string[];
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
