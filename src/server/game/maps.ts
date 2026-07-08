import { GameMap } from './GameMap.js';
import { MAP_SIZES, type MapName } from '../../shared/constants.js';
import type { WorldMapArea } from '../../shared/types.js';

const labyrinth = new GameMap({
  name: 'Labyrinth',
  ...MAP_SIZES.Labyrinth,
  setting: 'inside',
  terrain: 'stone',
  exits: [
    {
      row: 14,
      col: 7,
      direction: 'south',
      toMap: 'Great Plains',
      toRow: 0,
      toCol: 10,
      description: 'Exit to Great Plains',
    },
  ],
});

// Center row for Great Plains' two town exits — floor(60 / 2), the same
// "floor of the size" convention Labyrinth's own exit row (7, floor(15/2))
// already used.
const GREAT_PLAINS_CENTER_ROW = Math.floor(MAP_SIZES['Great Plains'].rows / 2);
// Center row on Floro/Kortho's own side of the connection — floor(20 / 2).
const TOWN_CENTER_ROW = Math.floor(MAP_SIZES.Floro.rows / 2);

const greatPlains = new GameMap({
  name: 'Great Plains',
  ...MAP_SIZES['Great Plains'],
  setting: 'outside',
  terrain: 'grass',
  exits: [
    {
      row: 0,
      col: 10,
      direction: 'north',
      toMap: 'Labyrinth',
      toRow: 14,
      toCol: 7,
      description: 'Entrance to Labyrinth',
    },
    {
      row: GREAT_PLAINS_CENTER_ROW,
      col: 0,
      direction: 'west',
      toMap: 'Floro',
      toRow: TOWN_CENTER_ROW,
      toCol: MAP_SIZES.Floro.cols - 1,
      description: 'Road west to Floro',
    },
    {
      row: GREAT_PLAINS_CENTER_ROW,
      col: MAP_SIZES['Great Plains'].cols - 1,
      direction: 'east',
      toMap: 'Kortho',
      toRow: TOWN_CENTER_ROW,
      toCol: 0,
      description: 'Road east to Kortho',
    },
  ],
});

// Rival towns (lore only) — each is otherwise an ordinary registered map,
// just gated by GameGateway's town-entry check (see shared/constants.ts's
// TOWN_MAPS/RACE_CLASSIFICATION).
const floro = new GameMap({
  name: 'Floro',
  ...MAP_SIZES.Floro,
  setting: 'outside',
  terrain: 'grass',
  exits: [
    {
      row: TOWN_CENTER_ROW,
      col: MAP_SIZES.Floro.cols - 1,
      direction: 'east',
      toMap: 'Great Plains',
      toRow: GREAT_PLAINS_CENTER_ROW,
      toCol: 0,
      description: 'Road east to the Great Plains',
    },
  ],
});

const kortho = new GameMap({
  name: 'Kortho',
  ...MAP_SIZES.Kortho,
  setting: 'outside',
  terrain: 'grass',
  exits: [
    {
      row: TOWN_CENTER_ROW,
      col: 0,
      direction: 'west',
      toMap: 'Great Plains',
      toRow: GREAT_PLAINS_CENTER_ROW,
      toCol: MAP_SIZES['Great Plains'].cols - 1,
      description: 'Road west to the Great Plains',
    },
  ],
});

export const MAPS: Map<MapName, GameMap> = new Map([
  [labyrinth.name, labyrinth],
  [greatPlains.name, greatPlains],
  [floro.name, floro],
  [kortho.name, kortho],
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
