import type { Server, Socket } from 'socket.io';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';

export interface SyncPayload {
  player: PlayerSnapshot;
  minimap: MinimapCell[];
  room: RoomInfo;
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
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
