import type { MapName } from '../../shared/constants.js';
import type { Location } from './types.js';
import type { RoomInfo } from '../../shared/types.js';

// A "room" here is a single grid space in a map — every (map, row, col)
// has its own id and description. Not to be confused with `rooms/` (the
// player-capacity sharding/worker_thread concept) — that's about server
// load distribution, this is about the game world. Pure and dependency-free
// like the rest of `game/`, so it's usable from the main thread and from a
// room_thread worker alike, though nothing needs it there yet.
export function getRoomId(mapName: MapName, row: number, col: number): string {
  return `${mapName}:${row}:${col}`;
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
    description: getRoomDescription(location.mapName, location.row, location.col),
  };
}
