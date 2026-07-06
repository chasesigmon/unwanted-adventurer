import type { Server, Socket } from 'socket.io';
import type { PlayerSnapshot, MinimapCell } from '../../shared/types.js';

export interface SyncPayload {
  player: PlayerSnapshot;
  minimap: MinimapCell[];
}

export interface KickedPayload {
  message: string;
}

export interface CommandAck {
  ok: boolean;
  message: string;
  player?: PlayerSnapshot;
  minimap?: MinimapCell[] | null;
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
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
