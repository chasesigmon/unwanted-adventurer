// A single navigable grid instance (e.g. "Labyrinth" or "World"). Many of
// these can exist at once; players move between them by stepping onto an
// exit tile.
export class GameMap {
  constructor({ name, rows, cols, exits = [] }) {
    this.name = name;
    this.rows = rows;
    this.cols = cols;
    this.exits = exits; // [{ row, col, toMap, toRow, toCol }]
  }

  isInBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  getExitAt(row, col) {
    return this.exits.find((exit) => exit.row === row && exit.col === col) || null;
  }
}
