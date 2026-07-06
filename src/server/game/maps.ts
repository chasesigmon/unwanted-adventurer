import { GameMap } from './GameMap.js';
import { MAP_SIZES, type MapName } from '../../shared/constants.js';

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
