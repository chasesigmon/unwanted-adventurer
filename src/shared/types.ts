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
  exp: number;
  level: number;
  // Experience needed to reach the next level (level x 100) — derived
  // server-side, not stored; the client uses it purely to size the XP bar.
  maxTnl: number;
  // Permanent abilities gained via "consume <item>" (e.g. "lesser undead
  // resistance"). Not currently displayed anywhere client-side, but part
  // of the full player snapshot like every other stat.
  skills: string[];
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
