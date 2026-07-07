import type { Server, Socket } from 'socket.io';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';

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

// The player's live read on whoever they're currently fighting — name plus
// a 0-100 hp percentage, since the client never needs (or is trusted with)
// the monster's absolute hp/maxHp.
export interface CombatStatus {
  monsterName: string;
  hpPercent: number;
}

export interface CommandAck {
  ok: boolean;
  // One or more lines to append to the client's persistent message log
  // (never a replacement — the log only grows or is explicitly cleared by
  // the client-side "clear" command). A combat exchange is often more than
  // one line: e.g. ["You hit the skeleton for 6 damage!", "The skeleton
  // hits you for 2 damage."].
  messages: string[];
  player?: PlayerSnapshot;
  minimap?: MinimapCell[] | null;
  room?: RoomInfo;
  // Always sent alongside `room` (never independently) — its absence when
  // `room` is present means "no monster here", not "unknown".
  monsterMessage?: string;
  // Same "always alongside room" rule as monsterMessage, for a dropped item.
  itemMessage?: string;
  // Tri-state, only ever set by "attack"/"flee" acks: a CombatStatus object
  // means this command started/continued a fight; explicit `null` means it
  // just ended one (conveyed via `messages`, not this field); omitted
  // entirely (undefined) means this command doesn't pertain to combat at
  // all (movement, unknown command) and the client should leave whatever
  // combat status it's already showing alone — an in-progress auto-attack
  // loop keeps running server-side regardless of what other commands the
  // player sends, and is only ever ended via "flee" (which separately
  // triggers a 'combat:update' push) or a kill.
  combat?: CombatStatus | null;
  loggedOut?: boolean;
}

// Pushed roughly every 4 seconds while an "attack <mob>" loop is running
// for this connection, without the client sending anything — see
// GameGateway's activeCombats/tickCombat. `ended` is true on the final
// push for a given fight (kill or target out of reach), at which point
// `monster` is omitted and the client should clear its combat display.
export interface CombatUpdatePayload {
  messages: string[];
  player: PlayerSnapshot;
  monster?: CombatStatus;
  monsterMessage?: string;
  itemMessage?: string;
  ended: boolean;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
  'combat:update': (data: CombatUpdatePayload) => void;
}

export interface ClientToServerEvents {
  command: (text: string, ack: (res: CommandAck) => void) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  username: string;
  // Cached from Mongo at connection time. Nothing changes these mid-session
  // yet, so re-reading from the DB on every command would be wasted work —
  // this is the seam where per-session stat mutation would plug in later.
  hp: number;
  mana: number;
  movement: number;
  exp: number;
  level: number;
  skills: string[];
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
