import type { Server, Socket } from 'socket.io';
import type { MapName, Race, Direction } from './constants.js';

export interface PlayerSnapshot {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
}

// A static (never-moving) map occupant — the "test/dummy" skeleton in the
// Great Plains today; same shape a wandering NPC could reuse later.
export interface NpcSnapshot {
  id: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
}

export interface SyncPayload {
  player: PlayerSnapshot;
}

// Broadcast to everyone in a map's room whenever anyone joins, moves
// within it, or leaves — the client's only source of truth for rendering
// other players/NPCs (and thus for knowing which tiles are occupied).
export interface MapStatePayload {
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
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

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
  'map:state': (data: MapStatePayload) => void;
  punch: (data: PunchPayload) => void;
}

export interface ClientToServerEvents {
  move: (direction: Direction, ack: (res: MoveAck) => void) => void;
  punch: (direction: Direction) => void;
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
