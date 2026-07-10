import type { MapName, Direction } from './constants.js';

// A single source of truth for both the server (movement resolution) and
// the client (rendering the floor/door) — no need to duplicate these
// numbers on each side the way the old proof-of-concept project had to
// (that one's client and server were fully separate npm packages; this
// one's shared/ directory is readable from both, same as the root
// project's own src/shared/).
export interface MapExit {
  row: number;
  col: number;
  direction: Direction;
  toMap: MapName;
  toRow: number;
  toCol: number;
}

// "inside" (Labyrinth) vs. "outside" (everywhere else) — pure
// flavor/classification here (unlike the text game's own GameMap.ts,
// where "inside" alone drives movement cost). This project's cost is
// driven by terrain instead (see MOVEMENT_COST_FOR_TERRAIN below), since
// Floro/Kortho are outside but built of stone, not grass, and are meant
// to cost the same as being inside.
export type MapSetting = 'inside' | 'outside';
export type MapTerrain = 'stone' | 'grass';

export interface MapDefinition {
  name: MapName;
  rows: number;
  cols: number;
  setting: MapSetting;
  terrain: MapTerrain;
  exits: MapExit[];
}

// Per-step movement-point cost, purely by terrain — stone (Labyrinth,
// and Floro/Kortho's town streets) costs the same whether you're
// nominally "inside" or "outside"; open grass (Great Plains) costs more.
export const MOVEMENT_COST_FOR_TERRAIN: Record<MapTerrain, number> = {
  stone: 2,
  grass: 3,
};

export function movementCostFor(mapName: MapName): number {
  return MOVEMENT_COST_FOR_TERRAIN[getMap(mapName).terrain];
}

const GREAT_PLAINS_SIZE = 100;
const LABYRINTH_SIZE = 60;
const TOWN_SIZE = 50;
// "Very top middle" / "south middle" — floor(size / 2), the same
// even-width convention the text game's own map exits use.
const GREAT_PLAINS_MID_COL = Math.floor(GREAT_PLAINS_SIZE / 2);
const GREAT_PLAINS_MID_ROW = Math.floor(GREAT_PLAINS_SIZE / 2);
const LABYRINTH_MID_COL = Math.floor(LABYRINTH_SIZE / 2);
const TOWN_MID_ROW = Math.floor(TOWN_SIZE / 2);

export const MAPS: Record<MapName, MapDefinition> = {
  'Great Plains': {
    name: 'Great Plains',
    rows: GREAT_PLAINS_SIZE,
    cols: GREAT_PLAINS_SIZE,
    setting: 'outside',
    terrain: 'grass',
    exits: [
      {
        row: 0,
        col: GREAT_PLAINS_MID_COL,
        direction: 'north',
        toMap: 'Labyrinth',
        toRow: LABYRINTH_SIZE - 1,
        toCol: LABYRINTH_MID_COL,
      },
      {
        row: GREAT_PLAINS_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Floro',
        toRow: TOWN_MID_ROW,
        toCol: TOWN_SIZE - 1,
      },
      {
        row: GREAT_PLAINS_MID_ROW,
        col: GREAT_PLAINS_SIZE - 1,
        direction: 'east',
        toMap: 'Kortho',
        toRow: TOWN_MID_ROW,
        toCol: 0,
      },
    ],
  },
  Labyrinth: {
    name: 'Labyrinth',
    rows: LABYRINTH_SIZE,
    cols: LABYRINTH_SIZE,
    setting: 'inside',
    terrain: 'stone',
    exits: [
      {
        row: LABYRINTH_SIZE - 1,
        col: LABYRINTH_MID_COL,
        direction: 'south',
        toMap: 'Great Plains',
        toRow: 0,
        toCol: GREAT_PLAINS_MID_COL,
      },
    ],
  },
  Floro: {
    name: 'Floro',
    rows: TOWN_SIZE,
    cols: TOWN_SIZE,
    // Outside, but built of stone streets, not grass — costs the same to
    // cross as being indoors (see MOVEMENT_COST_FOR_TERRAIN) even though
    // it isn't. Its buildings will eventually have their own "inside"
    // shop interiors; the town square itself stays "outside".
    setting: 'outside',
    terrain: 'stone',
    exits: [
      {
        row: TOWN_MID_ROW,
        col: TOWN_SIZE - 1,
        direction: 'east',
        toMap: 'Great Plains',
        toRow: GREAT_PLAINS_MID_ROW,
        toCol: 0,
      },
    ],
  },
  Kortho: {
    name: 'Kortho',
    rows: TOWN_SIZE,
    cols: TOWN_SIZE,
    // Same reasoning as Floro above.
    setting: 'outside',
    terrain: 'stone',
    exits: [
      {
        row: TOWN_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Great Plains',
        toRow: GREAT_PLAINS_MID_ROW,
        toCol: GREAT_PLAINS_SIZE - 1,
      },
    ],
  },
};

export function getMap(name: MapName): MapDefinition {
  const map = MAPS[name];
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}
