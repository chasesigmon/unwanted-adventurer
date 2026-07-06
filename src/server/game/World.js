import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { config } from '../config.js';

// Owns the authoritative grid and every connected player's position on it.
// Movement is turn-based: a command comes in, is validated against the
// grid bounds, and the result is handed straight back — there is no
// continuous simulation loop to drive here.
export class World {
  constructor() {
    this.rows = config.gridRows;
    this.cols = config.gridCols;
    this.players = new Map(); // socket id -> PlayerState
  }

  addPlayer(playerState) {
    this.players.set(playerState.id, playerState);
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  isInBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  movePlayer(id, direction) {
    const player = this.players.get(id);
    if (!player) return null;

    const delta = DIRECTION_DELTAS[direction];
    const nextRow = player.row + delta.dr;
    const nextCol = player.col + delta.dc;

    if (!this.isInBounds(nextRow, nextCol)) {
      return { ok: false, player };
    }

    player.row = nextRow;
    player.col = nextCol;
    return { ok: true, player };
  }

  // 3x3 view centered on the player, for the minimap.
  getMinimap(id) {
    const player = this.players.get(id);
    if (!player) return null;

    const cells = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const row = player.row + dr;
        const col = player.col + dc;
        cells.push({ self: dr === 0 && dc === 0, inBounds: this.isInBounds(row, col) });
      }
    }
    return cells;
  }
}
