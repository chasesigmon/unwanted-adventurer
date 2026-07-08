import type { Server, Socket } from 'socket.io';
import type { MapName, Race, Direction } from './constants.js';

export interface PlayerSnapshot {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
}

export interface SyncPayload {
  player: PlayerSnapshot;
}

export interface MoveAck {
  ok: boolean;
  player: PlayerSnapshot;
  // Set when ok is false (e.g. walked into the world's edge) or on a map
  // transition (e.g. "You enter the Labyrinth.") — purely cosmetic, the
  // client doesn't have to show it.
  message?: string;
}

export interface KickedPayload {
  message: string;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
}

export interface ClientToServerEvents {
  move: (direction: Direction, ack: (res: MoveAck) => void) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
