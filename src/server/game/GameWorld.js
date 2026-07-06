import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { MAPS } from './maps.js';

// Owns every connected player's position across all map instances, and
// resolves movement (including transitions through exits) against
// whichever map that player currently occupies. Movement stays turn-based:
// a command comes in, is validated against the player's current map, and
// the result is handed straight back.
export class GameWorld {
  constructor() {
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

  getMap(name) {
    return MAPS.get(name);
  }

  movePlayer(id, direction) {
    const player = this.players.get(id);
    if (!player) return null;

    const map = this.getMap(player.mapName);
    const delta = DIRECTION_DELTAS[direction];
    const nextRow = player.row + delta.dr;
    const nextCol = player.col + delta.dc;

    if (!map.isInBounds(nextRow, nextCol)) {
      return { ok: false, transitioned: false, player };
    }

    const exit = map.getExitAt(nextRow, nextCol);
    if (exit) {
      const fromMap = player.mapName;
      player.mapName = exit.toMap;
      player.row = exit.toRow;
      player.col = exit.toCol;
      return { ok: true, transitioned: true, fromMap, toMap: exit.toMap, player };
    }

    player.row = nextRow;
    player.col = nextCol;
    return { ok: true, transitioned: false, player };
  }

  // 3x3 view centered on the player, for the minimap. Works the same way
  // regardless of which map the player is currently on.
  getMinimap(id) {
    const player = this.players.get(id);
    if (!player) return null;
    const map = this.getMap(player.mapName);

    const cells = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const row = player.row + dr;
        const col = player.col + dc;
        const self = dr === 0 && dc === 0;
        const inBounds = map.isInBounds(row, col);
        const exit = inBounds && !self && !!map.getExitAt(row, col);
        cells.push({ self, inBounds, exit });
      }
    }
    return cells;
  }
}
