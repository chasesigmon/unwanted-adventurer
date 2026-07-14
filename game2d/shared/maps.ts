import type { MapName, Direction } from './constants.js';
import { FLORO_SHOP_MAPS, BRAMWICK_SHOP_MAPS } from './constants.js';

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

// Shrunk to about 2/3 smaller (a follow-up ask) from the old 180 — the
// tightest square that still comfortably fits the castle (60 tiles wide)
// PLUS a full moat ring around it with a real margin on every side (see
// MOAT_BUFFER_TILES/MOAT_WIDTH_TILES/MOAT_OUTER_BANK_TILES below); going
// all the way down to a literal 1/3 (60) would leave the moat with
// nowhere to sit outside the castle's own footprint.
const GRIMOAK_GROUNDS_SIZE = 80;
// Extended 25% wider to the right (a follow-up ask) — the castle/moat/
// gate below are all positioned from CASTLE_DOOR_ON_GROUNDS's own fixed
// col (40) and fixed offsets from it, not from this size constant, so
// widening only the COLS here leaves every one of them exactly where
// they already are; the new 20-tile strip (cols 80-99) is just empty
// ground to their east for the new wild skeleton/goblin populations
// (see server/monsters/monster.ts) to roam.
export const GRIMOAK_GROUNDS_COLS = Math.round(GRIMOAK_GROUNDS_SIZE * 1.25);
// Where the new 25%-wider strip actually starts (col 80) — the new wild
// skeleton/goblin populations (server/monsters/monster.ts) only spawn at
// or past this column.
export const GRIMOAK_GROUNDS_EXTENSION_MIN_COL = GRIMOAK_GROUNDS_SIZE;
// Centered horizontally; positioned to leave enough headroom north of the
// castle (and south of it, for the moat + bridge + a spawn point OUTSIDE
// the moat) — see GRIMOAK_GROUNDS_SPAWN/startingPositionFor below.
export const CASTLE_DOOR_ON_GROUNDS = { row: 55, col: 40 };

// The castle exterior's own footprint in tiles (item 5's collision) —
// derived from its raw asset size (1920x672px, see
// tools/gen-castle-exterior.mjs — widened by adding towers/wings, not by
// stretching, per item 2's correction) times its 1x render scale (see
// src/game/mapRender.ts's CASTLE_EXTERIOR_SCALE, halved again per a
// follow-up "same building count, half the size" request) divided by the
// 32px tile size, computed here as plain numbers since this shared module
// (read by the server for collision) has no reason to depend on Phaser
// or any client-only rendering constant.
const CASTLE_FOOTPRINT_WIDTH_TILES = 60; // (1920 * 1) / 32
const CASTLE_FOOTPRINT_HEIGHT_TILES = 21; // (672 * 1) / 32

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

// ---------- The moat + bridge (a follow-up ask: "add a mote that goes
// around it with a bridge in the front that allows access across the
// mote") — a rectangular ring standing off from the castle's own
// footprint by MOAT_BUFFER_TILES, MOAT_WIDTH_TILES wide, with a single
// gap in its south (front) side that the bridge crosses. Blocks movement
// everywhere except that bridge gap, so reaching the castle door actually
// requires using it. ----------
const MOAT_BUFFER_TILES = 4; // clear ground between the castle's walls and the moat's inner edge
const MOAT_WIDTH_TILES = 3;
const BRIDGE_HALF_WIDTH_TILES = 2; // a 5-tile-wide bridge

// Exported too — the client needs these same inner-edge coordinates to
// know exactly where to stop drawing the moat's water (see WorldScene's
// renderMap, which draws the ring as outer-rect-minus-inner-rect, same
// shape as isMoatBlocked below).
export const MOAT_INNER_LEFT = CASTLE_DOOR_ON_GROUNDS.col - Math.floor(CASTLE_FOOTPRINT_WIDTH_TILES / 2) - MOAT_BUFFER_TILES;
export const MOAT_INNER_RIGHT = CASTLE_DOOR_ON_GROUNDS.col + Math.floor(CASTLE_FOOTPRINT_WIDTH_TILES / 2) + MOAT_BUFFER_TILES;
export const MOAT_INNER_TOP = CASTLE_DOOR_ON_GROUNDS.row - CASTLE_FOOTPRINT_HEIGHT_TILES - MOAT_BUFFER_TILES;
export const MOAT_INNER_BOTTOM = CASTLE_DOOR_ON_GROUNDS.row + MOAT_BUFFER_TILES;
export const MOAT_OUTER_LEFT = MOAT_INNER_LEFT - MOAT_WIDTH_TILES;
export const MOAT_OUTER_RIGHT = MOAT_INNER_RIGHT + MOAT_WIDTH_TILES;
export const MOAT_OUTER_TOP = MOAT_INNER_TOP - MOAT_WIDTH_TILES;
export const MOAT_OUTER_BOTTOM = MOAT_INNER_BOTTOM + MOAT_WIDTH_TILES;
export const BRIDGE_COL_LEFT = CASTLE_DOOR_ON_GROUNDS.col - BRIDGE_HALF_WIDTH_TILES;
export const BRIDGE_COL_RIGHT = CASTLE_DOOR_ON_GROUNDS.col + BRIDGE_HALF_WIDTH_TILES;

export function isBridgeTile(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  return row >= MOAT_INNER_BOTTOM && row <= MOAT_OUTER_BOTTOM && col >= BRIDGE_COL_LEFT && col <= BRIDGE_COL_RIGHT;
}

export function isMoatBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  const inOuter = row >= MOAT_OUTER_TOP && row <= MOAT_OUTER_BOTTOM && col >= MOAT_OUTER_LEFT && col <= MOAT_OUTER_RIGHT;
  if (!inOuter) return false;
  const inInner = row >= MOAT_INNER_TOP && row <= MOAT_INNER_BOTTOM && col >= MOAT_INNER_LEFT && col <= MOAT_INNER_RIGHT;
  if (inInner) return false;
  if (isBridgeTile(mapName, row, col)) return false;
  return true;
}

// The moat's own full rectangular footprint (the water ring itself PLUS
// the walkable courtyard it encloses between the ring and the castle
// walls) — used to keep wild monster spawning (imps, a follow-up ask:
// "they should only spawn on any of the areas outside/surrounding the
// mote") off of the courtyard entirely, not just off the water tiles
// isMoatBlocked itself blocks movement onto. Deliberately NOT used for
// player movement — the courtyard/bridge stay normal walkable ground for
// a player crossing to the castle door.
export function isWithinMoatFootprint(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  return row >= MOAT_OUTER_TOP && row <= MOAT_OUTER_BOTTOM && col >= MOAT_OUTER_LEFT && col <= MOAT_OUTER_RIGHT;
}

// Just outside the moat's own outer edge, in front of the bridge — a new
// player has to actually cross the bridge to reach the castle door now,
// rather than spawning right next to it.
export const GRIMOAK_GROUNDS_SPAWN = { row: MOAT_OUTER_BOTTOM + 1, col: CASTLE_DOOR_ON_GROUNDS.col };

// ---------- The castle gate (a follow-up ask: "add a large double metal
// gate/fence on the other side of the bridge... it should open magically
// with each gate parting to allow the player through") — sits right at
// the bridge's own OUTER end (the side away from the castle, where the
// spawn point is), spanning its exact width. Blocks every tile of its own
// row across that width; whether it's currently passable for a PLAYER
// depends on live player proximity (see WorldManagerService.isGateOpen,
// which needs the actual connected-player positions this file has no
// access to) — it never opens for a monster at all (see
// MonsterManagerService.isFree's own unconditional gate check). ----------
export const GATE_ROW = MOAT_OUTER_BOTTOM;
export const GATE_COL_LEFT = BRIDGE_COL_LEFT;
export const GATE_COL_RIGHT = BRIDGE_COL_RIGHT;
// "When a player gets within a couple of feet of it" — same ~2.5ft/tile
// convention SHOP_REACH_TILES/BED_REACH_TILES already use elsewhere.
export const GATE_REACH_TILES = 2;

export function isGateTile(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  return row === GATE_ROW && col >= GATE_COL_LEFT && col <= GATE_COL_RIGHT;
}

// Where a brand new (or respawning) character appears on a given map —
// only Grimoak Grounds has an explicit spawn point (its door is no longer
// centered); everything else still falls back to the map's own center.
export function startingPositionFor(mapName: MapName): { row: number; col: number } {
  if (mapName === 'Grimoak Grounds') return GRIMOAK_GROUNDS_SPAWN;
  const map = getMap(mapName);
  return { row: Math.floor(map.rows / 2), col: Math.floor(map.cols / 2) };
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

// Classrooms specifically (not the dorm-style common rooms) got shrunk to
// a third of the standard room footprint — see src/game/mapRender.ts's
// CLASSROOM_ZOOM, which zooms the camera in to compensate so these still
// "fill up the whole screen" despite the smaller grid. Still derived from
// the ORIGINAL ROOM_ROWS/COLS above, not the shrunk COMMON_ROOM_ROWS/COLS
// below — a later follow-up ask shrunk the house common rooms further
// (25%, matching the Entrance Hall's own earlier reduction) without
// touching classroom size at all.
export const CLASSROOM_ROWS = Math.round(ROOM_ROWS / 3);
export const CLASSROOM_COLS = Math.round(ROOM_COLS / 3);
export const CLASSROOM_MID_ROW = Math.floor(CLASSROOM_ROWS / 2);
export const CLASSROOM_MID_COL = Math.floor(CLASSROOM_COLS / 2);

// Reduced by 25% from the original 48x70, then another 5% by a later
// follow-up ask (36x53 -> 34x50).
const ENTRANCE_ROWS = Math.round(36 * 0.95);
const ENTRANCE_COLS = Math.round(53 * 0.95);
const ENTRANCE_MID_ROW = Math.floor(ENTRANCE_ROWS / 2);
const ENTRANCE_MID_COL = Math.floor(ENTRANCE_COLS / 2);

// The Great Hall/common-room family's own base footprint — pinned to the
// Entrance Hall's PRE-5%-reduction size (36x53) rather than the live
// ENTRANCE_ROWS/COLS above, since a later follow-up ask ("reduce the size
// of the great hall and common rooms to be the same as the entrance
// hall") deliberately decoupled them from the Entrance Hall's own
// footprint at that point in time — shrinking the Entrance Hall again
// (see ENTRANCE_ROWS/COLS above) must not cascade into these too.
const GREAT_HALL_FAMILY_BASE_ROWS = 36;
const GREAT_HALL_FAMILY_BASE_COLS = 53;

// The Great Hall originally matched the Entrance Hall's own size exactly,
// but got shrunk another 25% by a later follow-up ask ("reduce the size
// of the Great Hall by 25%," to make room for the new banquet-table/
// faculty-stage furniture below without an oversized empty room).
const COMMON_ROOM_ROWS = Math.round(GREAT_HALL_FAMILY_BASE_ROWS * 0.75);
const COMMON_ROOM_COLS = Math.round(GREAT_HALL_FAMILY_BASE_COLS * 0.75);
const COMMON_ROOM_MID_ROW = Math.floor(COMMON_ROOM_ROWS / 2);
const COMMON_ROOM_MID_COL = Math.floor(COMMON_ROOM_COLS / 2);

// Each common room's own "Dorms" room (a later follow-up ask) — "1/5 the
// size of the common room," read as 1/5 the AREA (so the room keeps a
// normal-looking rectangular shape for 5 evenly-spaced beds, rather than
// a sliver in one dimension) — a linear scale factor of sqrt(1/5) on
// each side.
const DORM_ROOM_SCALE = Math.sqrt(0.2);
const DORM_ROOM_ROWS = Math.round(COMMON_ROOM_ROWS * DORM_ROOM_SCALE);
const DORM_ROOM_COLS = Math.round(COMMON_ROOM_COLS * DORM_ROOM_SCALE);
const DORM_ROOM_MID_COL = Math.floor(DORM_ROOM_COLS / 2);

const GREAT_HALL_ROWS = Math.round(GREAT_HALL_FAMILY_BASE_ROWS * 0.75);
const GREAT_HALL_COLS = Math.round(GREAT_HALL_FAMILY_BASE_COLS * 0.75);
const GREAT_HALL_MID_ROW = Math.floor(GREAT_HALL_ROWS / 2);

// A simplified castle (a follow-up ask): every classroom hangs directly
// off the Entrance Hall's own previously-unused north wall, instead of
// via the Grand Staircase/Dungeon Corridor hub rooms — those two, and the
// whole first/second-floor corridor concept, have been removed outright
// (see the "deferred" project memory note for the 2nd floor/stairs work
// this replaces). The house common rooms live on the EAST/WEST walls
// instead (a follow-up ask: "only the classrooms should be to the
// north") — see ENTRANCE_EAST_DOORS/ENTRANCE_WEST_DOORS below.
const ENTRANCE_NORTH_DOORS: Array<{ col: number; name: MapName }> = [
  { col: 9, name: 'Specialization' },
  { col: 18, name: 'Defense Classroom' },
  { col: 27, name: 'Summoning Classroom' },
  { col: 35, name: 'Utility Classroom' },
  { col: 44, name: 'Offense Classroom' },
];

// The house common rooms (plus Great Hall, already east) — spread across
// the Entrance Hall's east and west walls instead of the north one, which
// is now classrooms-only (a follow-up ask). Each entry's own `toRow`
// carries the row the door lands on INSIDE that room (Great Hall keeps
// its own distinct GREAT_HALL_MID_ROW; every common room is the shrunk
// COMMON_ROOM_MID_ROW), so both this array and each room's own reciprocal
// exit (see commonRoomOffEntranceHall/GREAT_HALL/THISTLEDOWN_COMMON_ROOM
// below) stay derived from one shared source instead of duplicating
// literals on both sides of the door.
const ENTRANCE_EAST_DOORS: Array<{ row: number; name: MapName; toRow: number }> = [
  { row: 12, name: 'Great Hall', toRow: GREAT_HALL_MID_ROW },
  { row: 24, name: 'Duskwing Common Room', toRow: COMMON_ROOM_MID_ROW },
];
const ENTRANCE_WEST_DOORS: Array<{ row: number; name: MapName; toRow: number }> = [
  { row: 9, name: 'Thistledown Common Room', toRow: COMMON_ROOM_MID_ROW },
  { row: 18, name: 'Emberclaw Common Room', toRow: COMMON_ROOM_MID_ROW },
  { row: 27, name: 'Starfall Common Room', toRow: COMMON_ROOM_MID_ROW },
];

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
    ...ENTRANCE_EAST_DOORS.map(({ row, name, toRow }) => ({
      row,
      col: ENTRANCE_COLS - 1,
      direction: 'east' as const,
      toMap: name,
      toRow,
      toCol: 0,
    })),
    ...ENTRANCE_WEST_DOORS.map(({ row, name, toRow }) => ({
      row,
      col: 0,
      direction: 'west' as const,
      toMap: name,
      toRow,
      toCol: COMMON_ROOM_COLS - 1,
    })),
    ...ENTRANCE_NORTH_DOORS.map(({ col, name }) => ({
      row: 0,
      col,
      direction: 'north' as const,
      toMap: name,
      toRow: CLASSROOM_ROWS - 1,
      toCol: CLASSROOM_MID_COL,
    })),
  ],
};

// A room hanging directly off the Entrance Hall's north wall, entered
// through its own south wall — same reciprocal-exit tile pair pattern as
// every other room in this file, built generically since the classrooms
// are otherwise identical (only their name/door column differ). House
// common rooms (bigger, COMMON_ROOM_ROWS/COLS) use their own dedicated
// definitions below since they also carry lore/flavor comments, but
// follow the exact same door math.
function classroomOffEntranceHall(name: MapName): MapDefinition {
  const entranceDoor = ENTRANCE_NORTH_DOORS.find((d) => d.name === name)!;
  return {
    name,
    rows: CLASSROOM_ROWS,
    cols: CLASSROOM_COLS,
    terrain: 'stone',
    exits: [
      {
        row: CLASSROOM_ROWS - 1,
        col: CLASSROOM_MID_COL,
        direction: 'south',
        toMap: 'Grimoak Entrance Hall',
        toRow: 0,
        toCol: entranceDoor.col,
      },
    ],
  };
}

const GREAT_HALL: MapDefinition = {
  name: 'Great Hall',
  rows: GREAT_HALL_ROWS,
  cols: GREAT_HALL_COLS,
  terrain: 'stone',
  exits: [
    {
      row: GREAT_HALL_MID_ROW,
      col: 0,
      direction: 'west',
      toMap: 'Grimoak Entrance Hall',
      toRow: ENTRANCE_EAST_DOORS.find((d) => d.name === 'Great Hall')!.row,
      toCol: ENTRANCE_COLS - 1,
    },
  ],
};

const THISTLEDOWN_COMMON_ROOM: MapDefinition = {
  name: 'Thistledown Common Room',
  rows: COMMON_ROOM_ROWS,
  cols: COMMON_ROOM_COLS,
  terrain: 'stone',
  exits: [
    {
      row: COMMON_ROOM_MID_ROW,
      col: COMMON_ROOM_COLS - 1,
      direction: 'east',
      toMap: 'Grimoak Entrance Hall',
      toRow: ENTRANCE_WEST_DOORS.find((d) => d.name === 'Thistledown Common Room')!.row,
      toCol: 0,
    },
  ],
};

// The other 3 house common rooms — on the Entrance Hall's east or west
// wall (a follow-up ask: "only the classrooms should be to the north"),
// instead of the removed Grand Staircase/Dungeon Corridor hub rooms. Kept
// as their own dedicated definitions (rather than classroomOffEntranceHall,
// which is classroom-sized) since these are COMMON_ROOM_ROWS/COLS, a
// different (now smaller, see its own doc comment) footprint. `side`
// picks which of the Entrance Hall's own door lists to look the room's
// door row up in, and mirrors which of the room's OWN walls the
// reciprocal exit sits on (its far wall from that side, same "walk in
// one side, out the door on the way back" shape everywhere else in this
// file uses).
function commonRoomOffEntranceHall(name: MapName, side: 'east' | 'west'): MapDefinition {
  const entranceDoor = (side === 'west' ? ENTRANCE_WEST_DOORS : ENTRANCE_EAST_DOORS).find((d) => d.name === name)!;
  return {
    name,
    rows: COMMON_ROOM_ROWS,
    cols: COMMON_ROOM_COLS,
    terrain: 'stone',
    exits: [
      {
        row: COMMON_ROOM_MID_ROW,
        col: side === 'east' ? 0 : COMMON_ROOM_COLS - 1,
        direction: side === 'east' ? 'west' : 'east',
        toMap: 'Grimoak Entrance Hall',
        toRow: entranceDoor.row,
        toCol: side === 'east' ? ENTRANCE_COLS - 1 : 0,
      },
    ],
  };
}

// A common room "on the east side of the Entrance Hall" is reached
// through one of the Entrance Hall's OWN east-wall doors, and its own
// reciprocal exit is therefore on its WEST wall (col 0) — hence the
// side passed to commonRoomOffEntranceHall is the room's own position
// relative to the Entrance Hall, matching ENTRANCE_EAST_DOORS/
// ENTRANCE_WEST_DOORS above (Emberclaw/Starfall sit west of the hall,
// same wall as Thistledown; Duskwing sits east, alongside Great Hall).
const EMBERCLAW_COMMON_ROOM = commonRoomOffEntranceHall('Emberclaw Common Room', 'west');
const STARFALL_COMMON_ROOM = commonRoomOffEntranceHall('Starfall Common Room', 'west');
const DUSKWING_COMMON_ROOM = commonRoomOffEntranceHall('Duskwing Common Room', 'east');

// Each common room's own Dorms room (a later follow-up ask) — reached
// through a NEW door on the common room's own north wall (its east/west
// walls are already spoken for by the Entrance Hall exit above), 5 beds
// inside (see shared/lighting.ts's bedPositionsFor).
function dormsFor(name: MapName, commonRoom: MapDefinition): MapDefinition {
  commonRoom.exits.push({
    row: 0,
    col: COMMON_ROOM_MID_COL,
    direction: 'north',
    toMap: name,
    toRow: DORM_ROOM_ROWS - 1,
    toCol: DORM_ROOM_MID_COL,
  });
  return {
    name,
    rows: DORM_ROOM_ROWS,
    cols: DORM_ROOM_COLS,
    terrain: 'stone',
    exits: [
      {
        row: DORM_ROOM_ROWS - 1,
        col: DORM_ROOM_MID_COL,
        direction: 'south',
        toMap: commonRoom.name,
        toRow: 0,
        toCol: COMMON_ROOM_MID_COL,
      },
    ],
  };
}
const THISTLEDOWN_DORMS = dormsFor('Thistledown Dorms', THISTLEDOWN_COMMON_ROOM);
const EMBERCLAW_DORMS = dormsFor('Emberclaw Dorms', EMBERCLAW_COMMON_ROOM);
const STARFALL_DORMS = dormsFor('Starfall Dorms', STARFALL_COMMON_ROOM);
const DUSKWING_DORMS = dormsFor('Duskwing Dorms', DUSKWING_COMMON_ROOM);

// The 5 rooms named in the original request — Elemental Casting, Defense,
// Summoning, Utility (renamed from Utilization — a follow-up ask),
// Offense, each with an explicit "Classroom" suffix (another follow-up
// ask), all connected directly to the Entrance Hall. Elemental Casting
// stopped being a classroom at all in a later follow-up ask (renamed to
// "Specialization," dropped from CLASSROOM_MAPS) — same classroomOffEntranceHall
// shape/size, just no longer counted among "the classrooms."
const SPECIALIZATION = classroomOffEntranceHall('Specialization');
const DEFENSE = classroomOffEntranceHall('Defense Classroom');
const SUMMONING = classroomOffEntranceHall('Summoning Classroom');
const UTILIZATION = classroomOffEntranceHall('Utility Classroom');
const OFFENSE = classroomOffEntranceHall('Offense Classroom');

// The secret bonus room (a follow-up ask) — a small locked room "behind
// the teacher" in the Utility Classroom, reached through its own
// previously-unused north wall (row 0). Same footprint as any other
// classroom (CLASSROOM_ROWS/COLS) — small, holds just a treasure chest
// and a few automatic wall torches (see shared/lighting.ts's
// ALWAYS_LIT_MAPS). Offset left of the room's own wall torch (a follow-up
// ask: "move the door... left of the torch" — torchWallPositionsFor
// places one at col WALL_TORCH_SPACING=6) rather than centered under the
// teacher, so it reads as a distinct, deliberately-placed door rather
// than architecturally identical to the teacher's own desk column. The
// door itself is LOCKED per-player (see shared/constants.ts's MapName and
// game.gateway.ts's handleMove, which gates the actual transition on
// client.data.secretDoorUnlocked) — resolveMove/this reciprocal exit pair
// just describe WHERE the door leads, not whether it's currently passable.
export const CAVERNA_SECRET_DOOR_POSITION = { row: 0, col: 4 };
// The reciprocal tile on the SECRET ROOM's own side of that same door —
// a separate constant (rather than reusing CLASSROOM_MID_COL inline)
// purely so game.gateway.ts's handleCastResera can recognize "the secret
// door" from either side without hardcoding its position twice.
export const CAVERNA_SECRET_DOOR_INSIDE_POSITION = { row: CLASSROOM_ROWS - 1, col: CLASSROOM_MID_COL };
const CAVERNA_SECRETISSIMA: MapDefinition = {
  name: 'Caverna Secretissima',
  rows: CLASSROOM_ROWS,
  cols: CLASSROOM_COLS,
  terrain: 'stone',
  exits: [
    {
      row: CAVERNA_SECRET_DOOR_INSIDE_POSITION.row,
      col: CAVERNA_SECRET_DOOR_INSIDE_POSITION.col,
      direction: 'south',
      toMap: 'Utility Classroom',
      toRow: CAVERNA_SECRET_DOOR_POSITION.row + 1,
      toCol: CAVERNA_SECRET_DOOR_POSITION.col,
    },
  ],
};
UTILIZATION.exits.push({
  row: CAVERNA_SECRET_DOOR_POSITION.row,
  col: CAVERNA_SECRET_DOOR_POSITION.col,
  direction: 'north',
  toMap: 'Caverna Secretissima',
  toRow: CAVERNA_SECRET_DOOR_INSIDE_POSITION.row,
  toCol: CAVERNA_SECRET_DOOR_INSIDE_POSITION.col,
});

// The treasure chest (a follow-up ask) — dead center of the room, well
// clear of the door on its south wall. Also LOCKED per-player (see
// client.data.secretChestUnlocked) — collision-blocked the same way a
// podium is (see isChestBlocked in shared/spells.ts) regardless of lock
// state, since it's a solid object either way.
export const CAVERNA_CHEST_POSITION = { row: Math.floor(CLASSROOM_ROWS / 2), col: CLASSROOM_MID_COL };

// ---------- The castle's 3 upper floors (a later follow-up ask) — each a
// small landing reached by stairs, half the Entrance Hall's own size.
// Floors 2 and 3 each hang 5 classroom-sized specialization chambers off
// their own north wall (same classroomOffEntranceHall shape, just off a
// floor landing instead of the Entrance Hall); floor 4 has no chambers at
// all, just 4 decorative portals (see shared/lighting.ts's
// portalPositionsFor — these are NOT MapExits, purely client-side props,
// so they can never accidentally function as a real transition).
// Every landing uses the SAME south-wall convention for its own stairs:
// the down-stairs (back to the floor below) at DOWN_STAIRS_COL, the
// up-stairs/floor-4-portal-slot (further up, or repurposed as a portal on
// floor 4, which has nothing above it) at UP_STAIRS_COL — both plain
// literals (not read from any other floor's own definition) so each
// floor's exits can be built independently and still reciprocate exactly,
// same "precompute both sides' fixed coordinates first" approach the
// Entrance Hall's own up-stairs (below) already needs. ----------
// Exported — shared/lighting.ts's portalPositionsFor needs these same
// numbers to place floor 4's own 4 decorative portals without
// duplicating (and risking drift from) this geometry.
export const FLOOR_LANDING_ROWS = Math.round(ENTRANCE_ROWS / 2); // half the Entrance Hall's own size
export const FLOOR_LANDING_COLS = Math.round(ENTRANCE_COLS / 2);
export const FLOOR_LANDING_MID_ROW = Math.floor(FLOOR_LANDING_ROWS / 2);
const FLOOR_LANDING_DOWN_STAIRS_COL = 6;
export const FLOOR_LANDING_UP_STAIRS_COL = 19;

// "About 7 feet equivalent left of the entrance to the entrance hall" —
// the Entrance Hall's own main south door sits at (ENTRANCE_ROWS-1,
// ENTRANCE_MID_COL); 7 tiles west of that, same row (same south wall).
const ENTRANCE_HALL_UP_STAIRS = { row: ENTRANCE_ROWS - 1, col: ENTRANCE_MID_COL - 7 };

// The 5 specialization chambers each floor's own landing hangs off its
// north wall — same door-column spread as ENTRANCE_NORTH_DOORS, just
// across the landing's own (smaller) width. The first 5 specialization
// paths live on floor 2, the other 5 on floor 3 (see
// shared/constants.ts's SPECIALIZATION_PATHS/SPECIALIZATION_CHAMBER_MAPS).
const FLOOR2_CHAMBER_DOORS: Array<{ col: number; name: MapName }> = [
  { col: 4, name: 'Necromancer Chamber' },
  { col: 8, name: 'Enhancer Chamber' },
  { col: 12, name: 'Elementalist Chamber' },
  { col: 16, name: 'Summoner Chamber' },
  { col: 20, name: 'Illusionist Chamber' },
];
const FLOOR3_CHAMBER_DOORS: Array<{ col: number; name: MapName }> = [
  { col: 4, name: 'Battlemage Chamber' },
  { col: 8, name: 'Cleric Chamber' },
  { col: 12, name: 'Druid Chamber' },
  { col: 16, name: 'Diabolist Chamber' },
  { col: 20, name: 'Hemomancer Chamber' },
];

// A specialization chamber — same shape as classroomOffEntranceHall
// (13x19, a single south exit back to its own floor's landing), just
// hung off a floor landing's own north-wall door list instead of the
// Entrance Hall's. Deliberately NOT added to CLASSROOM_MAPS (see
// shared/constants.ts) so it gets zero generic student desks — "similar
// to the existing classrooms... but no desks in these rooms."
function chamberOffFloorLanding(name: MapName, landingName: MapName, landingDoors: Array<{ col: number; name: MapName }>): MapDefinition {
  const landingDoor = landingDoors.find((d) => d.name === name)!;
  return {
    name,
    rows: CLASSROOM_ROWS,
    cols: CLASSROOM_COLS,
    terrain: 'stone',
    exits: [
      {
        row: CLASSROOM_ROWS - 1,
        col: CLASSROOM_MID_COL,
        direction: 'south',
        toMap: landingName,
        toRow: 0,
        toCol: landingDoor.col,
      },
    ],
  };
}

// A floor landing itself — the 5 chamber doors on its north wall (if
// any; floor 4 has none), a down-stairs on its south wall back to
// whichever floor is below, and (for floors 2/3 only) an up-stairs
// further along that same south wall to the floor above.
function floorLandingDefinition(
  name: MapName,
  chamberDoors: Array<{ col: number; name: MapName }>,
  downStairs: { toMap: MapName; toRow: number; toCol: number },
  upStairs?: { toMap: MapName; toRow: number; toCol: number }
): MapDefinition {
  const exits: MapExit[] = [
    ...chamberDoors.map(({ col, name: chamberName }) => ({
      row: 0,
      col,
      direction: 'north' as const,
      toMap: chamberName,
      toRow: CLASSROOM_ROWS - 1,
      toCol: CLASSROOM_MID_COL,
    })),
    {
      row: FLOOR_LANDING_ROWS - 1,
      col: FLOOR_LANDING_DOWN_STAIRS_COL,
      direction: 'south',
      kind: 'stairs',
      toMap: downStairs.toMap,
      toRow: downStairs.toRow,
      toCol: downStairs.toCol,
    },
  ];
  if (upStairs) {
    exits.push({
      row: FLOOR_LANDING_ROWS - 1,
      col: FLOOR_LANDING_UP_STAIRS_COL,
      direction: 'south',
      kind: 'stairs',
      toMap: upStairs.toMap,
      toRow: upStairs.toRow,
      toCol: upStairs.toCol,
    });
  }
  return { name, rows: FLOOR_LANDING_ROWS, cols: FLOOR_LANDING_COLS, terrain: 'stone', exits };
}

const FLOOR2_LANDING = floorLandingDefinition(
  'Grimoak Castle 2nd Floor',
  FLOOR2_CHAMBER_DOORS,
  { toMap: 'Grimoak Entrance Hall', toRow: ENTRANCE_HALL_UP_STAIRS.row, toCol: ENTRANCE_HALL_UP_STAIRS.col },
  { toMap: 'Grimoak Castle 3rd Floor', toRow: FLOOR_LANDING_ROWS - 1, toCol: FLOOR_LANDING_DOWN_STAIRS_COL }
);
const FLOOR3_LANDING = floorLandingDefinition(
  'Grimoak Castle 3rd Floor',
  FLOOR3_CHAMBER_DOORS,
  { toMap: 'Grimoak Castle 2nd Floor', toRow: FLOOR_LANDING_ROWS - 1, toCol: FLOOR_LANDING_UP_STAIRS_COL },
  { toMap: 'Grimoak Castle 4th Floor', toRow: FLOOR_LANDING_ROWS - 1, toCol: FLOOR_LANDING_DOWN_STAIRS_COL }
);
// Floor 4 has no chambers of its own (no north-wall doors) and nothing
// above it — just the down-stairs back to floor 3, plus 4 decorative
// portals (see shared/lighting.ts's portalPositionsFor; NOT MapExits, so
// they render but can never actually transition anywhere yet).
const FLOOR4_LANDING = floorLandingDefinition('Grimoak Castle 4th Floor', [], {
  toMap: 'Grimoak Castle 3rd Floor',
  toRow: FLOOR_LANDING_ROWS - 1,
  toCol: FLOOR_LANDING_UP_STAIRS_COL,
});

// The Entrance Hall's own reciprocal half of its up-stairs to floor 2 —
// pushed on afterward (same "define the room, then push an additional
// exit once the target's own info is known" shape the secret door below
// already uses for Utility Classroom).
ENTRANCE_HALL.exits.push({
  row: ENTRANCE_HALL_UP_STAIRS.row,
  col: ENTRANCE_HALL_UP_STAIRS.col,
  direction: 'south',
  kind: 'stairs',
  toMap: 'Grimoak Castle 2nd Floor',
  toRow: FLOOR_LANDING_ROWS - 1,
  toCol: FLOOR_LANDING_DOWN_STAIRS_COL,
});

const NECROMANCER_CHAMBER = chamberOffFloorLanding('Necromancer Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const ENHANCER_CHAMBER = chamberOffFloorLanding('Enhancer Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const ELEMENTALIST_CHAMBER = chamberOffFloorLanding('Elementalist Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const SUMMONER_CHAMBER = chamberOffFloorLanding('Summoner Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const ILLUSIONIST_CHAMBER = chamberOffFloorLanding('Illusionist Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const BATTLEMAGE_CHAMBER = chamberOffFloorLanding('Battlemage Chamber', 'Grimoak Castle 3rd Floor', FLOOR3_CHAMBER_DOORS);
const CLERIC_CHAMBER = chamberOffFloorLanding('Cleric Chamber', 'Grimoak Castle 3rd Floor', FLOOR3_CHAMBER_DOORS);
const DRUID_CHAMBER = chamberOffFloorLanding('Druid Chamber', 'Grimoak Castle 3rd Floor', FLOOR3_CHAMBER_DOORS);
const DIABOLIST_CHAMBER = chamberOffFloorLanding('Diabolist Chamber', 'Grimoak Castle 3rd Floor', FLOOR3_CHAMBER_DOORS);
const HEMOMANCER_CHAMBER = chamberOffFloorLanding('Hemomancer Chamber', 'Grimoak Castle 3rd Floor', FLOOR3_CHAMBER_DOORS);

// ---------- Bramwick (a later follow-up ask) — a small village just
// north of Grimoak Grounds, dirt-road street with 4 shop cottages. Same
// hub-and-spoke shape as Floro's own shops (see shopInteriorDefinition/
// floroShopDoorExits above), just parameterized to Bramwick's own name/
// door list instead. ----------
const BRAMWICK_SIZE = 40;
const BRAMWICK_MID_COL = Math.floor(BRAMWICK_SIZE / 2);

const BRAMWICK_SHOP_DOORS: Record<(typeof BRAMWICK_SHOP_MAPS)[number], { row: number; col: number }> = {
  'Bramwick General Shop': { row: 10, col: 10 },
  'Bramwick Wands': { row: 10, col: 30 },
  'Bramwick Armor': { row: 28, col: 10 },
  'Bramwick Potions': { row: 28, col: 30 },
};

function bramwickShopInteriorDefinition(name: (typeof BRAMWICK_SHOP_MAPS)[number]): MapDefinition {
  const door = BRAMWICK_SHOP_DOORS[name];
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
        toMap: 'Bramwick',
        toRow: door.row,
        toCol: door.col,
      },
    ],
  };
}

function bramwickShopDoorExits(): MapExit[] {
  return BRAMWICK_SHOP_MAPS.map((name) => {
    const door = BRAMWICK_SHOP_DOORS[name];
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

// Bramwick's own south entrance — a dirt road leading north from Grimoak
// Grounds (see the new north-wall exit added to Grimoak Grounds' own
// MAPS entry below), with a clickable name sign just inside (see
// shared/lighting.ts's BRAMWICK_SIGN_POSITION).
const BRAMWICK_ENTRANCE_ROW = BRAMWICK_SIZE - 1;

export { BRAMWICK_MID_COL, BRAMWICK_ENTRANCE_ROW };

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
  Bramwick: {
    name: 'Bramwick',
    rows: BRAMWICK_SIZE,
    cols: BRAMWICK_SIZE,
    // The actual dirt-road look comes from mapRender.ts's own
    // floorTextureFor (keyed on map name, same as every other map here —
    // this `terrain` field is unused metadata, see MapTerrain's own doc
    // comment), not this field.
    terrain: 'grass',
    exits: [
      {
        row: BRAMWICK_ENTRANCE_ROW,
        col: BRAMWICK_MID_COL,
        direction: 'south',
        toMap: 'Grimoak Grounds',
        toRow: 0,
        toCol: CASTLE_DOOR_ON_GROUNDS.col,
      },
      ...bramwickShopDoorExits(),
    ],
  },
  'Bramwick General Shop': bramwickShopInteriorDefinition('Bramwick General Shop'),
  'Bramwick Wands': bramwickShopInteriorDefinition('Bramwick Wands'),
  'Bramwick Armor': bramwickShopInteriorDefinition('Bramwick Armor'),
  'Bramwick Potions': bramwickShopInteriorDefinition('Bramwick Potions'),
  'Grimoak Grounds': {
    name: 'Grimoak Grounds',
    rows: GRIMOAK_GROUNDS_SIZE,
    cols: GRIMOAK_GROUNDS_COLS,
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
      // Bramwick's own south entrance sits directly north of the castle
      // door, straight up the open ground north of the moat (a later
      // follow-up ask: "a dirt road leading north").
      {
        row: 0,
        col: CASTLE_DOOR_ON_GROUNDS.col,
        direction: 'north',
        toMap: 'Bramwick',
        toRow: BRAMWICK_ENTRANCE_ROW,
        toCol: BRAMWICK_MID_COL,
      },
    ],
  },
  'Grimoak Entrance Hall': ENTRANCE_HALL,
  'Great Hall': GREAT_HALL,
  'Thistledown Common Room': THISTLEDOWN_COMMON_ROOM,
  'Duskwing Common Room': DUSKWING_COMMON_ROOM,
  'Emberclaw Common Room': EMBERCLAW_COMMON_ROOM,
  'Starfall Common Room': STARFALL_COMMON_ROOM,
  'Thistledown Dorms': THISTLEDOWN_DORMS,
  'Duskwing Dorms': DUSKWING_DORMS,
  'Emberclaw Dorms': EMBERCLAW_DORMS,
  'Starfall Dorms': STARFALL_DORMS,
  Specialization: SPECIALIZATION,
  'Defense Classroom': DEFENSE,
  'Summoning Classroom': SUMMONING,
  'Utility Classroom': UTILIZATION,
  'Offense Classroom': OFFENSE,
  'Caverna Secretissima': CAVERNA_SECRETISSIMA,
  'Grimoak Castle 2nd Floor': FLOOR2_LANDING,
  'Grimoak Castle 3rd Floor': FLOOR3_LANDING,
  'Grimoak Castle 4th Floor': FLOOR4_LANDING,
  'Necromancer Chamber': NECROMANCER_CHAMBER,
  'Enhancer Chamber': ENHANCER_CHAMBER,
  'Elementalist Chamber': ELEMENTALIST_CHAMBER,
  'Summoner Chamber': SUMMONER_CHAMBER,
  'Illusionist Chamber': ILLUSIONIST_CHAMBER,
  'Battlemage Chamber': BATTLEMAGE_CHAMBER,
  'Cleric Chamber': CLERIC_CHAMBER,
  'Druid Chamber': DRUID_CHAMBER,
  'Diabolist Chamber': DIABOLIST_CHAMBER,
  'Hemomancer Chamber': HEMOMANCER_CHAMBER,
};

export function getMap(name: MapName): MapDefinition {
  const map = MAPS[name];
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}

// A later follow-up ask: "give the stairs collision on the left or right
// of them so that the player has to walk into the stairs from north to
// south" — every 'stairs'-kind exit in this project sits on a south-
// facing wall (walked onto, then further south, to trigger it), so
// blocking the tiles immediately east/west of it (same row) forces
// approach along the stairs' own column instead of sidling in diagonally
// or from the side.
export function isStairsSideBlocked(mapName: MapName, row: number, col: number): boolean {
  const def = getMap(mapName);
  return def.exits.some((e) => e.kind === 'stairs' && e.row === row && Math.abs(e.col - col) === 1);
}
