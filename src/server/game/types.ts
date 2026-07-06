import type { MapName } from '../../shared/constants.js';

export interface Location {
  mapName: MapName;
  row: number;
  col: number;
}

export interface Exit {
  row: number;
  col: number;
  toMap: MapName;
  toRow: number;
  toCol: number;
}

// Discriminated on both `ok` and `transitioned` so callers narrow to the
// exact shape they need (e.g. `fromMap` only exists when transitioned).
export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
