import { GameMap } from './GameMap.js';
import { MAP_SIZES, type MapName } from '../../shared/constants.js';
import type { WorldMapArea } from '../../shared/types.js';

const labyrinth = new GameMap({
  name: 'Labyrinth',
  ...MAP_SIZES.Labyrinth,
  exits: [{ row: 14, col: 7, toMap: 'World', toRow: 0, toCol: 10 }],
});

const world = new GameMap({
  name: 'World',
  ...MAP_SIZES.World,
  exits: [{ row: 0, col: 10, toMap: 'Labyrinth', toRow: 14, toCol: 7 }],
});

export const MAPS: Map<MapName, GameMap> = new Map([
  [labyrinth.name, labyrinth],
  [world.name, world],
]);

// Every MapName is guaranteed to be registered above; this centralizes
// that invariant instead of non-null-asserting `MAPS.get(...)` everywhere.
export function getMap(name: MapName): GameMap {
  const map = MAPS.get(name);
  if (!map) {
    throw new Error(`Unknown map: ${name}`);
  }
  return map;
}

// Coarse "map of maps" for the "worldmap" command — every registered area
// and which other areas its exits lead to, with no per-room detail (that's
// what the "map" command, and resolveFullMapGrid, are for).
export function getWorldOverview(): WorldMapArea[] {
  return Array.from(MAPS.values()).map((m) => ({
    name: m.name,
    rows: m.rows,
    cols: m.cols,
    connectsTo: Array.from(new Set(m.exits.map((exit) => exit.toMap))),
  }));
}
