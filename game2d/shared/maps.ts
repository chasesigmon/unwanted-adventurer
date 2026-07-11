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
  // Absent (a plain door) unless set — 'stairs' picks the stairs texture
  // client-side instead of a door (item 6) and is purely cosmetic; the
  // transition mechanics are identical either way.
  kind?: 'stairs';
}

// Purely flavor/classification (what the ground looks/sounds like) — the
// movement-point system this used to also drive (see the old
// MOVEMENT_COST_FOR_SETTING) has been removed entirely (item 2).
export type MapTerrain = 'stone' | 'grass';

export interface MapDefinition {
  name: MapName;
  rows: number;
  cols: number;
  terrain: MapTerrain;
  exits: MapExit[];
}

const GREAT_PLAINS_SIZE = 100;
const LABYRINTH_SIZE = 60;
const TOWN_SIZE = 50;
// Exported so the client can decide which way a shop building's facade
// should face (item 13) — a shop door west of the town's own center
// column faces right/east (toward the main square), one east of it faces
// left/west, purely by comparing its own exit's `col` to this.
export const TOWN_MID_COL = Math.floor(TOWN_SIZE / 2);
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

// ---------- Grimoak Academy (the wizarding-school pivot) ----------
// Same hub-and-spoke shape Floro's shops already established: every real
// room is its own small interior map, connected by a reciprocal exit
// tile pair (walking onto a door tile from either side lands you exactly
// on the matching door tile the other side). See the published world
// sketch for the full room directory this phase-1 set implements.

// Sized to comfortably fit the castle exterior at its new 5x-scaled
// footprint (item 2: CASTLE_EXTERIOR_TILE_HEIGHT tall, bottom-anchored at
// the door) with room to spare above it and a good stretch of grounds
// below/around for the courtyard/lake/pitch sketched for later.
const GRIMOAK_GROUNDS_SIZE = 180;
// Not centered anymore now that the castle needs so much headroom above
// it — see GRIMOAK_GROUNDS_SPAWN/startingPositionFor below, which replaced
// the old "just spawn at floor(rows/2)" convenience trick.
export const CASTLE_DOOR_ON_GROUNDS = { row: 130, col: 90 };
// One tile south of the door — "just outside the castle entrance."
export const GRIMOAK_GROUNDS_SPAWN = { row: CASTLE_DOOR_ON_GROUNDS.row + 1, col: CASTLE_DOOR_ON_GROUNDS.col };

// Where a brand new (or respawning) character appears on a given map —
// only Grimoak Grounds has an explicit spawn point (its door is no longer
// centered); everything else still falls back to the map's own center.
export function startingPositionFor(mapName: MapName): { row: number; col: number } {
  if (mapName === 'Grimoak Grounds') return GRIMOAK_GROUNDS_SPAWN;
  const map = getMap(mapName);
  return { row: Math.floor(map.rows / 2), col: Math.floor(map.cols / 2) };
}

// The castle exterior's own footprint in tiles (item 5's collision) —
// derived from its raw asset size (384x672px, see
// tools/gen-castle-exterior.mjs) times its 5x render scale (item 2, see
// src/game/mapRender.ts's CASTLE_EXTERIOR_SCALE) divided by the 32px
// tile size, computed here as plain numbers since this shared module
// (read by the server for collision) has no reason to depend on Phaser
// or any client-only rendering constant.
const CASTLE_FOOTPRINT_WIDTH_TILES = 60; // (384 * 5) / 32
const CASTLE_FOOTPRINT_HEIGHT_TILES = 105; // (672 * 5) / 32

// True for any tile the castle's own exterior sprite visually covers,
// EXCEPT the door tile itself (still walkable — it's the entrance) —
// blocks a player from walking "through" the building's facade on the
// Grounds, same idea as shared/trees.ts's tree collision.
export function isCastleExteriorBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  if (row === CASTLE_DOOR_ON_GROUNDS.row && col === CASTLE_DOOR_ON_GROUNDS.col) return false;
  const left = CASTLE_DOOR_ON_GROUNDS.col - Math.floor(CASTLE_FOOTPRINT_WIDTH_TILES / 2);
  const right = CASTLE_DOOR_ON_GROUNDS.col + Math.floor(CASTLE_FOOTPRINT_WIDTH_TILES / 2);
  const top = CASTLE_DOOR_ON_GROUNDS.row - CASTLE_FOOTPRINT_HEIGHT_TILES;
  const bottom = CASTLE_DOOR_ON_GROUNDS.row;
  return row >= top && row <= bottom && col >= left && col <= right;
}

// Every castle interior is sized to comfortably exceed any real browser
// viewport at TILE_SIZE(32)px/tile (item 5: "fullscreen," not floating in
// a small box the camera centers with empty space around it — see
// WorldScene's own applyCameraBounds, which only stops following the
// player and centers the map when the WHOLE thing already fits on
// screen). A shared "standard room" size covers every classroom/common
// room; corridors and the two big hub spaces (Entrance Hall, Grand
// Staircase) get their own larger footprints.
const ROOM_ROWS = 40;
const ROOM_COLS = 56;
const ROOM_MID_ROW = Math.floor(ROOM_ROWS / 2);
const ROOM_MID_COL = Math.floor(ROOM_COLS / 2);

const CORRIDOR_ROWS = 36;
const CORRIDOR_COLS = 90;
const CORRIDOR_MID_ROW = Math.floor(CORRIDOR_ROWS / 2);
const CORRIDOR_MID_COL = Math.floor(CORRIDOR_COLS / 2);

const ENTRANCE_ROWS = 48;
const ENTRANCE_COLS = 70;
const ENTRANCE_MID_ROW = Math.floor(ENTRANCE_ROWS / 2);
const ENTRANCE_MID_COL = Math.floor(ENTRANCE_COLS / 2);

const GREAT_HALL_ROWS = 44;
const GREAT_HALL_COLS = 64;
const GREAT_HALL_MID_ROW = Math.floor(GREAT_HALL_ROWS / 2);

const STAIRCASE_ROWS = 44;
const STAIRCASE_COLS = 60;
const STAIRCASE_MID_ROW = Math.floor(STAIRCASE_ROWS / 2);
const STAIRCASE_MID_COL = Math.floor(STAIRCASE_COLS / 2);

const ENTRANCE_HALL: MapDefinition = {
  name: 'Grimoak Entrance Hall',
  rows: ENTRANCE_ROWS,
  cols: ENTRANCE_COLS,
  terrain: 'stone',
  exits: [
    {
      row: ENTRANCE_ROWS - 1,
      col: ENTRANCE_MID_COL,
      direction: 'south',
      toMap: 'Grimoak Grounds',
      toRow: CASTLE_DOOR_ON_GROUNDS.row,
      toCol: CASTLE_DOOR_ON_GROUNDS.col,
    },
    { row: ENTRANCE_MID_ROW, col: ENTRANCE_COLS - 1, direction: 'east', toMap: 'Great Hall', toRow: GREAT_HALL_MID_ROW, toCol: 0 },
    { row: ENTRANCE_MID_ROW, col: 0, direction: 'west', toMap: 'Thistledown Common Room', toRow: ROOM_MID_ROW, toCol: ROOM_COLS - 1 },
    { row: 0, col: ENTRANCE_MID_COL - 10, direction: 'north', toMap: 'Dungeon Corridor', toRow: CORRIDOR_ROWS - 1, toCol: CORRIDOR_MID_COL },
    { row: 0, col: ENTRANCE_MID_COL + 10, direction: 'north', toMap: 'Grand Staircase', toRow: STAIRCASE_ROWS - 1, toCol: STAIRCASE_MID_COL },
  ],
};

const GREAT_HALL: MapDefinition = {
  name: 'Great Hall',
  rows: GREAT_HALL_ROWS,
  cols: GREAT_HALL_COLS,
  terrain: 'stone',
  exits: [{ row: GREAT_HALL_MID_ROW, col: 0, direction: 'west', toMap: 'Grimoak Entrance Hall', toRow: ENTRANCE_MID_ROW, toCol: ENTRANCE_COLS - 1 }],
};

const THISTLEDOWN_COMMON_ROOM: MapDefinition = {
  name: 'Thistledown Common Room',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: ROOM_COLS - 1, direction: 'east', toMap: 'Grimoak Entrance Hall', toRow: ENTRANCE_MID_ROW, toCol: 0 }],
};

const DUNGEON_CORRIDOR: MapDefinition = {
  name: 'Dungeon Corridor',
  rows: CORRIDOR_ROWS,
  cols: CORRIDOR_COLS,
  terrain: 'stone',
  exits: [
    {
      row: CORRIDOR_ROWS - 1,
      col: CORRIDOR_MID_COL,
      direction: 'south',
      toMap: 'Grimoak Entrance Hall',
      toRow: 0,
      toCol: ENTRANCE_MID_COL - 10,
    },
    { row: CORRIDOR_MID_ROW, col: 0, direction: 'west', toMap: 'Alchemy', toRow: ROOM_MID_ROW, toCol: ROOM_COLS - 1 },
    { row: CORRIDOR_MID_ROW, col: CORRIDOR_COLS - 1, direction: 'east', toMap: 'Duskwing Common Room', toRow: ROOM_MID_ROW, toCol: 0 },
  ],
};

const ALCHEMY: MapDefinition = {
  name: 'Alchemy',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: ROOM_COLS - 1, direction: 'east', toMap: 'Dungeon Corridor', toRow: CORRIDOR_MID_ROW, toCol: 0 }],
};

const DUSKWING_COMMON_ROOM: MapDefinition = {
  name: 'Duskwing Common Room',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: 0, direction: 'west', toMap: 'Dungeon Corridor', toRow: CORRIDOR_MID_ROW, toCol: CORRIDOR_COLS - 1 }],
};

const GRAND_STAIRCASE: MapDefinition = {
  name: 'Grand Staircase',
  rows: STAIRCASE_ROWS,
  cols: STAIRCASE_COLS,
  terrain: 'stone',
  exits: [
    {
      row: STAIRCASE_ROWS - 1,
      col: STAIRCASE_MID_COL,
      direction: 'south',
      toMap: 'Grimoak Entrance Hall',
      toRow: 0,
      toCol: ENTRANCE_MID_COL + 10,
    },
    { row: 0, col: STAIRCASE_MID_COL, direction: 'north', toMap: 'First Floor Corridor', toRow: CORRIDOR_ROWS - 1, toCol: CORRIDOR_MID_COL },
    { row: STAIRCASE_MID_ROW, col: STAIRCASE_COLS - 1, direction: 'east', toMap: 'Emberclaw Common Room', toRow: ROOM_MID_ROW, toCol: 0 },
    { row: STAIRCASE_MID_ROW, col: 0, direction: 'west', toMap: 'Starfall Common Room', toRow: ROOM_MID_ROW, toCol: ROOM_COLS - 1 },
    // A staircase up to the second floor (item 6) — a distinct tile from
    // the other east exit, further down the same wall.
    {
      row: STAIRCASE_ROWS - 8,
      col: STAIRCASE_COLS - 1,
      direction: 'east',
      toMap: 'Second Floor Corridor',
      toRow: CORRIDOR_ROWS - 1,
      toCol: CORRIDOR_MID_COL,
      kind: 'stairs',
    },
  ],
};

// The second floor's own stub corridor (item 6) — just the stairs back
// down for now; classrooms up here are "eventually" work.
const SECOND_FLOOR_CORRIDOR: MapDefinition = {
  name: 'Second Floor Corridor',
  rows: CORRIDOR_ROWS,
  cols: CORRIDOR_COLS,
  terrain: 'stone',
  exits: [
    {
      row: CORRIDOR_ROWS - 1,
      col: CORRIDOR_MID_COL,
      direction: 'south',
      toMap: 'Grand Staircase',
      toRow: STAIRCASE_ROWS - 8,
      toCol: STAIRCASE_COLS - 1,
      kind: 'stairs',
    },
  ],
};

const FIRST_FLOOR_CORRIDOR: MapDefinition = {
  name: 'First Floor Corridor',
  rows: CORRIDOR_ROWS,
  cols: CORRIDOR_COLS,
  terrain: 'stone',
  exits: [
    { row: CORRIDOR_ROWS - 1, col: CORRIDOR_MID_COL, direction: 'south', toMap: 'Grand Staircase', toRow: 0, toCol: STAIRCASE_MID_COL },
    { row: CORRIDOR_MID_ROW, col: 0, direction: 'west', toMap: 'Elemental Casting', toRow: ROOM_MID_ROW, toCol: ROOM_COLS - 1 },
    { row: CORRIDOR_MID_ROW, col: CORRIDOR_COLS - 1, direction: 'east', toMap: 'Shapecraft', toRow: ROOM_MID_ROW, toCol: 0 },
  ],
};

const EMBERCLAW_COMMON_ROOM: MapDefinition = {
  name: 'Emberclaw Common Room',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: 0, direction: 'west', toMap: 'Grand Staircase', toRow: STAIRCASE_MID_ROW, toCol: STAIRCASE_COLS - 1 }],
};

const STARFALL_COMMON_ROOM: MapDefinition = {
  name: 'Starfall Common Room',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: ROOM_COLS - 1, direction: 'east', toMap: 'Grand Staircase', toRow: STAIRCASE_MID_ROW, toCol: 0 }],
};

const ELEMENTAL_CASTING: MapDefinition = {
  name: 'Elemental Casting',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: ROOM_COLS - 1, direction: 'east', toMap: 'First Floor Corridor', toRow: CORRIDOR_MID_ROW, toCol: 0 }],
};

const SHAPECRAFT: MapDefinition = {
  name: 'Shapecraft',
  rows: ROOM_ROWS,
  cols: ROOM_COLS,
  terrain: 'stone',
  exits: [{ row: ROOM_MID_ROW, col: 0, direction: 'west', toMap: 'First Floor Corridor', toRow: CORRIDOR_MID_ROW, toCol: CORRIDOR_COLS - 1 }],
};


export const MAPS: Record<MapName, MapDefinition> = {
  'Great Plains': {
    name: 'Great Plains',
    rows: GREAT_PLAINS_SIZE,
    cols: GREAT_PLAINS_SIZE,
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
  'Grimoak Grounds': {
    name: 'Grimoak Grounds',
    rows: GRIMOAK_GROUNDS_SIZE,
    cols: GRIMOAK_GROUNDS_SIZE,
    terrain: 'grass',
    exits: [
      {
        row: CASTLE_DOOR_ON_GROUNDS.row,
        col: CASTLE_DOOR_ON_GROUNDS.col,
        direction: 'north',
        toMap: 'Grimoak Entrance Hall',
        toRow: ENTRANCE_ROWS - 1,
        toCol: ENTRANCE_MID_COL,
      },
    ],
  },
  'Grimoak Entrance Hall': ENTRANCE_HALL,
  'Great Hall': GREAT_HALL,
  'Thistledown Common Room': THISTLEDOWN_COMMON_ROOM,
  'Dungeon Corridor': DUNGEON_CORRIDOR,
  Alchemy: ALCHEMY,
  'Duskwing Common Room': DUSKWING_COMMON_ROOM,
  'Grand Staircase': GRAND_STAIRCASE,
  'First Floor Corridor': FIRST_FLOOR_CORRIDOR,
  'Second Floor Corridor': SECOND_FLOOR_CORRIDOR,
  'Emberclaw Common Room': EMBERCLAW_COMMON_ROOM,
  'Starfall Common Room': STARFALL_COMMON_ROOM,
  'Elemental Casting': ELEMENTAL_CASTING,
  Shapecraft: SHAPECRAFT,
};

export function getMap(name: MapName): MapDefinition {
  const map = MAPS[name];
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}
