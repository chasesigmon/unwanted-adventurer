import type { MapName } from '../../shared/constants.js';

export interface Location {
  mapName: MapName;
  row: number;
  col: number;
}

export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
