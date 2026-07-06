import { DIRECTION_DELTAS, type Direction } from '../../shared/directions.js';
import { getMap } from './maps.js';
import type { Location, MoveResult } from './types.js';
import type { MinimapCell } from '../../shared/types.js';

// Pure movement/minimap resolution against the map registry. Kept
// dependency-free (no class, no shared mutable state) so it can run
// identically on the main thread or inside a world instance's
// worker_thread — the only difference between the two is *where* this
// function is called and which in-memory location record it's called
// against, not the game logic.
export function resolveMove(location: Location, direction: Direction): MoveResult {
  const map = getMap(location.mapName);
  const delta = DIRECTION_DELTAS[direction];
  const nextRow = location.row + delta.dr;
  const nextCol = location.col + delta.dc;

  if (!map.isInBounds(nextRow, nextCol)) {
    return { ok: false, transitioned: false, mapName: location.mapName, row: location.row, col: location.col };
  }

  const exit = map.getExitAt(nextRow, nextCol);
  if (exit) {
    return {
      ok: true,
      transitioned: true,
      fromMap: location.mapName,
      mapName: exit.toMap,
      row: exit.toRow,
      col: exit.toCol,
    };
  }

  return { ok: true, transitioned: false, mapName: location.mapName, row: nextRow, col: nextCol };
}

// 4x4 view around the location, for the minimap. There's no exact center
// cell on an even-sized grid, so the player sits one cell in from the
// top-left of the view (1 cell of context behind/left, 2 ahead/right on
// each axis) rather than dead center.
export function resolveMinimap(location: Location): MinimapCell[] {
  const map = getMap(location.mapName);
  const cells: MinimapCell[] = [];
  for (let dr = -1; dr <= 2; dr++) {
    for (let dc = -1; dc <= 2; dc++) {
      const row = location.row + dr;
      const col = location.col + dc;
      const self = dr === 0 && dc === 0;
      const inBounds = map.isInBounds(row, col);
      const exit = inBounds && !self && !!map.getExitAt(row, col);
      cells.push({ self, inBounds, exit });
    }
  }
  return cells;
}
