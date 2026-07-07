import type { MapName } from '../../shared/constants.js';
import type { Direction } from '../../shared/directions.js';

export interface Location {
  mapName: MapName;
  row: number;
  col: number;
}

export interface Exit {
  row: number;
  col: number;
  // Only crossing in this exact direction from (row, col) actually
  // transitions the player — arriving at (row, col) itself (from any
  // other direction) is just an ordinary walkable tile. See
  // resolveMove/GameMap.getExitAt.
  direction: Direction;
  toMap: MapName;
  toRow: number;
  toCol: number;
  // Shown as the room description at (row, col) instead of the generic
  // formula — e.g. "Exit to Great Plains" — see room.ts's getRoomDescription.
  description: string;
}

// Discriminated on both `ok` and `transitioned` so callers narrow to the
// exact shape they need (e.g. `fromMap` only exists when transitioned).
export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
