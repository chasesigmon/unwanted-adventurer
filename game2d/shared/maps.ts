import type { MapName, Direction } from './constants.js';
import { FLORO_SHOP_MAPS } from './constants.js';

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

// "inside" (Labyrinth) vs. "outside" (everywhere else) — drives per-step
// movement cost (see MOVEMENT_COST_FOR_SETTING below); terrain is pure
// flavor/classification (what the ground looks/sounds like), independent
// of cost.
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

// Per-step movement-point cost, by setting — a fractional cost (players
// were burning through almost their whole movement pool in just a few
// dozen steps at the old 2/3-per-step rates, especially on the 100-tile
// Great Plains).
export const MOVEMENT_COST_FOR_SETTING: Record<MapSetting, number> = {
  inside: 0.5,
  outside: 1,
};

export function movementCostFor(mapName: MapName): number {
  return MOVEMENT_COST_FOR_SETTING[getMap(mapName).setting];
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

// Floro's 7 shop interiors (item 13, phase 1) — a small room each,
// entered by walking north onto its own door tile on Floro's street (see
// FLORO_SHOP_DOORS below), landing on the exact same reciprocal exit
// tile pattern every other map transition in this project already uses
// (arrive ON the door tile of whichever side you're heading toward).
const SHOP_INTERIOR_SIZE = 10;
const SHOP_INTERIOR_MID_COL = Math.floor(SHOP_INTERIOR_SIZE / 2);
const SHOP_INTERIOR_DOOR_ROW = SHOP_INTERIOR_SIZE - 1;

// Where each shop's door sits on Floro's own street — spread into a
// loose town-square layout, well clear of Floro's existing east exit
// back to the Great Plains (row 25, col 49).
const FLORO_SHOP_DOORS: Record<(typeof FLORO_SHOP_MAPS)[number], { row: number; col: number }> = {
  'Floro Blacksmith': { row: 10, col: 15 },
  'Floro General Store': { row: 10, col: 35 },
  'Floro Inn': { row: 20, col: 8 },
  'Floro Bank': { row: 20, col: 42 },
  'Floro Armorer': { row: 32, col: 15 },
  'Floro Pet Salesman': { row: 32, col: 35 },
  'Floro Jobs Office': { row: 42, col: 25 },
};

function shopInteriorDefinition(name: (typeof FLORO_SHOP_MAPS)[number]): MapDefinition {
  const door = FLORO_SHOP_DOORS[name];
  return {
    name,
    rows: SHOP_INTERIOR_SIZE,
    cols: SHOP_INTERIOR_SIZE,
    setting: 'inside',
    terrain: 'stone',
    exits: [
      {
        row: SHOP_INTERIOR_DOOR_ROW,
        col: SHOP_INTERIOR_MID_COL,
        direction: 'south',
        toMap: 'Floro',
        toRow: door.row,
        toCol: door.col,
      },
    ],
  };
}

function floroShopDoorExits(): MapExit[] {
  return FLORO_SHOP_MAPS.map((name) => {
    const door = FLORO_SHOP_DOORS[name];
    return {
      row: door.row,
      col: door.col,
      direction: 'north',
      toMap: name,
      toRow: SHOP_INTERIOR_DOOR_ROW,
      toCol: SHOP_INTERIOR_MID_COL,
    };
  });
}

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
    // it isn't. The town square itself stays "outside"; its 7 shops (see
    // FLORO_SHOP_MAPS) are each their own real "inside" interior map.
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
      ...floroShopDoorExits(),
    ],
  },
  'Floro Blacksmith': shopInteriorDefinition('Floro Blacksmith'),
  'Floro General Store': shopInteriorDefinition('Floro General Store'),
  'Floro Inn': shopInteriorDefinition('Floro Inn'),
  'Floro Bank': shopInteriorDefinition('Floro Bank'),
  'Floro Armorer': shopInteriorDefinition('Floro Armorer'),
  'Floro Pet Salesman': shopInteriorDefinition('Floro Pet Salesman'),
  'Floro Jobs Office': shopInteriorDefinition('Floro Jobs Office'),
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
