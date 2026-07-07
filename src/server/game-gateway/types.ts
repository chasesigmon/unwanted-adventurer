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
  // Set once at connection time and never changed thereafter (race isn't
  // something a player can alter after registration).
  race: Race;
  // Cached from Mongo at connection time. Nothing changes these mid-session
  // yet, so re-reading from the DB on every command would be wasted work —
  // this is the seam where per-session stat mutation would plug in later.
  hp: number;
  mana: number;
  movement: number;
  exp: number;
  level: number;
  skills: string[];
  inventory: string[];
  consumeExp: number;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
