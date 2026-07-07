import type { MapName } from '../../shared/constants.js';
import type { Direction } from '../../shared/directions.js';
import type { Exit } from './types.js';

// "inside" (Labyrinth, stone) vs. "outside" (Great Plains, grass) — drives
// GameGateway's per-step movement-point cost (2 inside, 3 outside) and is
// otherwise just flavor/classification, not tied to any single room.
export type MapSetting = 'inside' | 'outside';
export type MapTerrain = 'stone' | 'grass';

export interface GameMapOptions {
  name: MapName;
  rows: number;
  cols: number;
  setting: MapSetting;
  terrain: MapTerrain;
  exits?: Exit[];
}

// A single navigable grid instance (e.g. "Labyrinth" or "Great Plains").
// Many of these can exist at once; players move between them by stepping
// in an exit's designated direction from its exact tile (see
// resolveMove) — arriving at that tile from any other direction is just
// an ordinary walkable room, not an automatic transition.
export class GameMap {
  readonly name: MapName;
  readonly rows: number;
  readonly cols: number;
  readonly setting: MapSetting;
  readonly terrain: MapTerrain;
  readonly exits: Exit[];

  constructor({ name, rows, cols, setting, terrain, exits = [] }: GameMapOptions) {
    this.name = name;
    this.rows = rows;
    this.cols = cols;
    this.setting = setting;
    this.terrain = terrain;
    this.exits = exits;
  }

  isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  // `direction` narrows to "is this exit actually crossable by stepping
  // this way from here" (resolveMove's use); omitted, it's just "is there
  // an exit tile here at all" (map display, minimap exit-highlighting,
  // room descriptions).
  getExitAt(row: number, col: number, direction?: Direction): Exit | null {
    return (
      this.exits.find(
        (exit) => exit.row === row && exit.col === col && (direction === undefined || exit.direction === direction)
      ) ?? null
    );
  }
}
