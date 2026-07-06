import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { MAPS } from './maps.js';

// Pure movement/minimap resolution against the map registry. Kept
// dependency-free (no class, no shared mutable state) so it can run
// identically on the main thread or inside a room's worker_thread — the
// only difference between the two is *where* this function is called and
// which in-memory location record it's called against, not the game logic.
export function resolveMove(location, direction) {
  const map = MAPS.get(location.mapName);
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

// 3x3 view centered on the location, for the minimap.
export function resolveMinimap(location) {
  const map = MAPS.get(location.mapName);
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
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
