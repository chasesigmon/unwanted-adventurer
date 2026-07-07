import { getMap } from './maps.js';
import type { MapName } from '../../shared/constants.js';
import type { Location } from './types.js';
import type { RoomInfo } from '../../shared/types.js';

// A "room" here is a single grid space in a map — every (map, row, col)
// has its own id, name, and description. Not to be confused with
// `worlds/` (the player-capacity sharding/worker_thread concept) — that's
// about server load distribution, this is about the game world. Pure and
// dependency-free like the rest of `game/`, so it's usable from the main
// thread and from a world instance's worker_thread alike, though nothing
// needs it there yet.
export function getRoomId(mapName: MapName, row: number, col: number): string {
  return `${mapName}:${row}:${col}`;
}

// Splits a map into a 3x3 grid of zones (each third of the rows/cols) and
// names the one (row, col) falls into — "North"/""/"South" combined with
// "West"/""/"East", falling back to "Center" when neither axis is on an
// edge third. Combined with the map name for getRoomName below (e.g.
// "Southeast Labyrinth", "Center Labyrinth").
function verticalZone(row: number, rows: number): string {
  const third = rows / 3;
  if (row < third) return 'North';
  if (row >= rows - third) return 'South';
  return '';
}

function horizontalZone(col: number, cols: number): string {
  const third = cols / 3;
  if (col < third) return 'West';
  if (col >= cols - third) return 'East';
  return '';
}

export function getRoomName(mapName: MapName, row: number, col: number): string {
  const map = getMap(mapName);
  const vertical = verticalZone(row, map.rows);
  const horizontal = horizontalZone(col, map.cols);
  // Lowercase the second half only when combining both axes — "North" +
  // "east" = "Northeast", not "NorthEast" — but a lone axis ("North",
  // "East") keeps its own capital.
  const side = vertical && horizontal ? `${vertical}${horizontal.toLowerCase()}` : vertical || horizontal || 'Center';
  return `${side} ${mapName}`;
}

// Placeholder content — the map name and position is all we have "for
// now". This is the seam where real authored per-room descriptions would
// replace the formula without changing RoomInfo's shape.
export function getRoomDescription(mapName: MapName, row: number, col: number): string {
  return `${mapName} (${row}, ${col})`;
}

export function resolveRoom(location: Location): RoomInfo {
  return {
    id: getRoomId(location.mapName, location.row, location.col),
    name: getRoomName(location.mapName, location.row, location.col),
    description: getRoomDescription(location.mapName, location.row, location.col),
  };
}
