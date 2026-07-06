import type { MapName } from './constants.js';

// Shapes actually sent over the wire (Socket.io 'sync' event and command
// acks) — kept here since both client and server need to agree on them.
export interface PlayerSnapshot {
  username: string;
  map: MapName;
  row: number;
  col: number;
}

export interface MinimapCell {
  self: boolean;
  inBounds: boolean;
  exit: boolean;
}
