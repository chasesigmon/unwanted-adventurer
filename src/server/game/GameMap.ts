import type { MapName } from '../../shared/constants.js';
import type { Exit } from './types.js';

export interface GameMapOptions {
  name: MapName;
  rows: number;
  cols: number;
  exits?: Exit[];
}

// A single navigable grid instance (e.g. "Labyrinth" or "World"). Many of
// these can exist at once; players move between them by stepping onto an
// exit tile.
export class GameMap {
  readonly name: MapName;
  readonly rows: number;
  readonly cols: number;
  readonly exits: Exit[];

  constructor({ name, rows, cols, exits = [] }: GameMapOptions) {
    this.name = name;
    this.rows = rows;
    this.cols = cols;
    this.exits = exits;
  }

  isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  getExitAt(row: number, col: number): Exit | null {
    return this.exits.find((exit) => exit.row === row && exit.col === col) ?? null;
  }
}
