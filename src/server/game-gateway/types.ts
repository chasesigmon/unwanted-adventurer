import type { Server, Socket } from 'socket.io';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';

export interface SyncPayload {
  player: PlayerSnapshot;
  minimap: MinimapCell[];
  room: RoomInfo;
  // Present whenever the player's current cell has a monster in it, e.g.
  // "A skeleton is here!" — omitted otherwise.
  monsterMessage?: string;
}

export interface KickedPayload {
  message: string;
}

export interface CommandAck {
  ok: boolean;
  message: string;
  player?: PlayerSnapshot;
  minimap?: MinimapCell[] | null;
  room?: RoomInfo;
  // Always sent alongside `room` (never independently) — its absence when
  // `room` is present means "no monster here", not "unknown".
  monsterMessage?: string;
  loggedOut?: boolean;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
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
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
