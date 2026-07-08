import { getMap } from '../../shared/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import type { Direction } from '../../shared/constants.js';
import type { Location, MoveResult } from './types.js';

// Pure, dependency-free (same philosophy as the text game's own
// resolveMove) — a step off the exact door tile in its exact direction
// transitions maps; anything else either moves within bounds or is
// rejected at the edge.
export function resolveMove(location: Location, direction: Direction): MoveResult {
  const map = getMap(location.mapName);

  const exit = map.exits.find((e) => e.row === location.row && e.col === location.col && e.direction === direction);
  if (exit) {
    return { ok: true, transitioned: true, fromMap: location.mapName, mapName: exit.toMap, row: exit.toRow, col: exit.toCol };
  }

  const delta = DIRECTION_DELTAS[direction];
  const nextRow = location.row + delta.dr;
  const nextCol = location.col + delta.dc;

  if (nextRow < 0 || nextRow >= map.rows || nextCol < 0 || nextCol >= map.cols) {
    return { ok: false, transitioned: false, mapName: location.mapName, row: location.row, col: location.col };
  }

  return { ok: true, transitioned: false, mapName: location.mapName, row: nextRow, col: nextCol };
}
