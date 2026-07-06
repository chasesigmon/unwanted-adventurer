import type { MapName } from './constants.js';

// Shapes actually sent over the wire (Socket.io 'sync' event and command
// acks) — kept here since both client and server need to agree on them.
export interface PlayerSnapshot {
  username: string;
  map: MapName;
  row: number;
  col: number;
  hp: number;
  mana: number;
  movement: number;
}

export interface MinimapCell {
  self: boolean;
  inBounds: boolean;
  exit: boolean;
}

// Each grid space is a "room" with its own id, name, and description. For
// now the name is just the map name and the description is derived from
// the map name and position — this is the seam where authored per-room
// content (real names/descriptions) would plug in later without changing
// the wire shape.
export interface RoomInfo {
  id: string;
  name: string;
  description: string;
}
