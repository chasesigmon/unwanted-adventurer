import type { MapName, Direction } from './constants.js';
import { FLORO_SHOP_MAPS, KORTHO_SHOP_MAPS, BRAMWICK_SHOP_MAPS, GOBBLER_VILLAGE_HUT_MAPS } from './constants.js';

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
  // transition mechanics are identical either way. 'open' (a later
  // follow-up ask, "remove the door... walk straight through") renders
  // NO sprite at all client-side (see WorldScene's renderDoorsAndChest) —
  // also purely cosmetic, transition mechanics are still identical.
  kind?: 'stairs' | 'open';
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

// Exported (a later follow-up ask needed it client-side, to size the new
// Floro connection's own sign/road placement relative to Great Plains'
// own east edge).
export const GREAT_PLAINS_SIZE = 100;
const LABYRINTH_SIZE = 60;
// Exported (a later follow-up ask needed Kortho's own unchanged ROW count
// client-side, to size the new sand/sea/sand strips' own tileSprites —
// Kortho only ever grows east, never taller, see KORTHO_COLS above).
export const TOWN_SIZE = 50;
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
export const TOWN_MID_ROW = Math.floor(TOWN_SIZE / 2);

// Floro's 7 shop interiors (item 13, phase 1) — a small room each,
// entered by walking north onto its own door tile on Floro's street (see
// FLORO_SHOP_DOORS below), landing on the exact same reciprocal exit
// tile pattern every other map transition in this project already uses
// (arrive ON the door tile of whichever side you're heading toward).
const SHOP_INTERIOR_SIZE = 10;
const SHOP_INTERIOR_MID_COL = Math.floor(SHOP_INTERIOR_SIZE / 2);
const SHOP_INTERIOR_DOOR_ROW = SHOP_INTERIOR_SIZE - 1;
// Floro's and Kortho's own shop interiors specifically (a later follow-up
// ask: "increase the size of the shops on the inside by 3" — 3x the
// original room, not Bramwick's, which is unaffected and keeps
// SHOP_INTERIOR_SIZE above).
const TOWN_SHOP_INTERIOR_SIZE = SHOP_INTERIOR_SIZE * 3;
const TOWN_SHOP_INTERIOR_MID_COL = Math.floor(TOWN_SHOP_INTERIOR_SIZE / 2);
const TOWN_SHOP_INTERIOR_DOOR_ROW = TOWN_SHOP_INTERIOR_SIZE - 1;

// Where each shop's door sits on Floro's own street — a later follow-up
// ask ("instead of having the shops arranged how they are now, arrange
// them in more of a square or rectangle design") replaced the original
// loose, organically-scattered layout (varying rows AND columns) with a
// clean two-row grid: 4 shops along row 15, 3 along row 32, evenly spaced
// with enough gap between columns that neither row's own building
// footprints (see isShopBuildingBlocked) touch their neighbors. Every
// door still faces north (approached from the south), so the existing
// mirroring/direction logic is unchanged — only the positions moved.
const FLORO_SHOP_DOORS: Record<(typeof FLORO_SHOP_MAPS)[number], { row: number; col: number }> = {
  'Floro Blacksmith': { row: 15, col: 10 },
  'Floro General Store': { row: 15, col: 20 },
  'Floro Inn': { row: 15, col: 30 },
  'Floro Bank': { row: 15, col: 40 },
  'Floro Armorer': { row: 32, col: 15 },
  'Floro Pet Salesman': { row: 32, col: 25 },
  'Floro Jobs Office': { row: 32, col: 35 },
};

function shopInteriorDefinition(name: (typeof FLORO_SHOP_MAPS)[number]): MapDefinition {
  const door = FLORO_SHOP_DOORS[name];
  return {
    name,
    rows: TOWN_SHOP_INTERIOR_SIZE,
    cols: TOWN_SHOP_INTERIOR_SIZE,
    terrain: 'stone',
    exits: [
      {
        row: TOWN_SHOP_INTERIOR_DOOR_ROW,
        col: TOWN_SHOP_INTERIOR_MID_COL,
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
      toRow: TOWN_SHOP_INTERIOR_DOOR_ROW,
      toCol: TOWN_SHOP_INTERIOR_MID_COL,
      // A later follow-up ask ("make sure... Floro get[s] the same
      // updates that Kortho is getting") — no separate GRAND_DOOR sprite
      // anymore, same "walk into the building's own baked-in door"
      // treatment as Bramwick's cottages/Kortho's shops (see WorldScene's
      // shopBuildingSprites positioning, now anchored directly on this
      // exit tile).
      kind: 'open',
    };
  });
}

// Kortho (a later follow-up ask: "add the town of Kortho back... same
// size and rules and shops as when it was being used before") — Floro's
// own rival-town twin, same hub-and-spoke shop shape mirrored rather than
// shared (see shared/constants.ts's own KORTHO_SHOP_MAPS doc comment).
// Door layout mirrors Floro's own (see its own doc comment above) —
// same two-row grid arrangement, unchanged since neither town's own
// entrance sits anywhere near these rows/columns.
const KORTHO_SHOP_DOORS: Record<(typeof KORTHO_SHOP_MAPS)[number], { row: number; col: number }> = {
  'Kortho Blacksmith': { row: 15, col: 10 },
  'Kortho General Store': { row: 15, col: 20 },
  'Kortho Inn': { row: 15, col: 30 },
  'Kortho Bank': { row: 15, col: 40 },
  'Kortho Armorer': { row: 32, col: 15 },
  'Kortho Pet Salesman': { row: 32, col: 25 },
  'Kortho Boat Shop': { row: 32, col: 35 },
};

function korthoShopInteriorDefinition(name: (typeof KORTHO_SHOP_MAPS)[number]): MapDefinition {
  const door = KORTHO_SHOP_DOORS[name];
  return {
    name,
    rows: TOWN_SHOP_INTERIOR_SIZE,
    cols: TOWN_SHOP_INTERIOR_SIZE,
    terrain: 'stone',
    exits: [
      {
        row: TOWN_SHOP_INTERIOR_DOOR_ROW,
        col: TOWN_SHOP_INTERIOR_MID_COL,
        direction: 'south',
        toMap: 'Kortho',
        toRow: door.row,
        toCol: door.col,
      },
    ],
  };
}

function korthoShopDoorExits(): MapExit[] {
  return KORTHO_SHOP_MAPS.map((name) => {
    const door = KORTHO_SHOP_DOORS[name];
    return {
      row: door.row,
      col: door.col,
      direction: 'north',
      toMap: name,
      toRow: TOWN_SHOP_INTERIOR_DOOR_ROW,
      toCol: TOWN_SHOP_INTERIOR_MID_COL,
      // A later follow-up ask: "remove the door from the entrance of the
      // shop from Kortho and make it so the character walks into the
      // shop by walking into/through the door on the sprite" — same
      // treatment Bramwick's cottages already use, no separate GRAND_DOOR
      // sprite (see WorldScene's own shopBuildingSprites for Kortho).
      kind: 'open',
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
// Extended another 10% to the south (a later follow-up ask) — same
// "widen without moving anything" shape as the COLS widening above: the
// castle/moat/gates are all positioned from CASTLE_DOOR_ON_GROUNDS's own
// fixed row (55) and fixed offsets from it, not from this size constant,
// so growing ROWS only adds new open ground south of the existing south
// gate (already 17-odd rows clear of it) rather than shifting anything.
// This is also where the new southwest "Road to Floro" exit (a later
// follow-up ask) actually gets its room — the moat's own footprint spans
// nearly the full original 80-wide band, so there's no real "southwest"
// until south of the south gate, which this newly-added strip provides.
export const GRIMOAK_GROUNDS_ROWS = Math.round(GRIMOAK_GROUNDS_SIZE * 1.1);

// ---------- Mystical Timberland (a later follow-up ask: "create a new
// World/area called 'Mystical Timberland' that is to the left of Grimoak
// Grounds... the same size as Grimoak Grounds") — unlike Road to Kortho/
// Floro, this connects DIRECTLY off Grimoak Grounds' own west edge (no
// separate corridor map), same single-shared-border shape Bramwick's own
// north connection already uses. ----------
export const MYSTICAL_TIMBERLAND_ROWS = GRIMOAK_GROUNDS_ROWS;
export const MYSTICAL_TIMBERLAND_COLS = GRIMOAK_GROUNDS_COLS;
export const MYSTICAL_TIMBERLAND_MID_ROW = Math.floor(MYSTICAL_TIMBERLAND_ROWS / 2);

// ---------- Road to Kortho (a later follow-up ask: "at the northeast of
// Grimoak grounds add a dirt road going east... Create 'Road to Kortho'
// which should be a dirt road... with grass surrounding it on either
// side. The map should be the same width as grimoak grounds, but 25% of
// its height... at the end... a stone road that leads into Kortho") —
// the connecting corridor reviving Kortho (see the Kortho MapDefinition
// below), same "own separate map, exits reciprocate" shape as every
// other room here. Sits well north of the moat (rows 0-26 are the same
// open band the rare monsters/dummy players already use), so its own
// east-edge exit at row GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW never
// conflicts with the castle/moat rectangle. ----------
export const ROAD_TO_KORTHO_COLS = GRIMOAK_GROUNDS_COLS;
// Derived from GRIMOAK_GROUNDS_ROWS (the Grounds' own TOTAL height, not
// the pre-expansion base) so this tracks the literal "25% of its height"
// spec even after the Grounds' own later south expansion.
export const ROAD_TO_KORTHO_ROWS = Math.round(GRIMOAK_GROUNDS_ROWS * 0.25);
export const ROAD_TO_KORTHO_MID_ROW = Math.floor(ROAD_TO_KORTHO_ROWS / 2);
// Same 5-tile-wide (2*halfWidth+1) band convention as the existing
// Grimoak Grounds <-> Bramwick dirt road (see
// GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES below) — "a dirt road of the
// same size as the ones leading out of Grimoak grounds."
export const ROAD_TO_KORTHO_HALF_WIDTH_TILES = 2;
// Where Grimoak Grounds' own new northeast exit sits — well clear of the
// moat/castle (rows 0-26 are open ground), a fixed row near the top of
// the map's own new 25%-wider eastern strip.
export const GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW = 10;

// ---------- Road to Floro (a later follow-up ask: "at the southwest of
// grimoak grounds add a dirt road... that goes south, leading to Floro...
// make it like the road to kortho") — the same corridor shape as Road to
// Kortho above, transposed for a north-south road instead of east-west:
// the "along-travel" dimension (now ROWS) matches Grimoak Grounds' own
// full height, and the "perpendicular" dimension (now COLS) is the short
// 25% figure. Sits south of the south gate (in the room the Grounds' own
// 10%-south expansion above just created — the moat's footprint leaves
// almost no open ground west of it anywhere further north). ----------
export const ROAD_TO_FLORO_ROWS = GRIMOAK_GROUNDS_ROWS;
export const ROAD_TO_FLORO_COLS = Math.round(GRIMOAK_GROUNDS_COLS * 0.25);
export const ROAD_TO_FLORO_MID_COL = Math.floor(ROAD_TO_FLORO_COLS / 2);
export const ROAD_TO_FLORO_HALF_WIDTH_TILES = 2;
// Where Grimoak Grounds' own new southwest exit sits — a fixed column
// near the west edge, well clear of the moat's own footprint (which
// spans nearly the entire original 80-wide band further north).
export const GRIMOAK_GROUNDS_ROAD_TO_FLORO_COL = 10;

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
// A later follow-up ask: "in the middle left (to the left of the middle
// of the moat), make a connection to the new area Mystical Timberland" —
// MOAT_OUTER_LEFT sits at col 3, so this row (well within the moat's own
// north/south span) still has open ground at cols 0-2, clear of the
// moat's own footprint — no bridge needed, unlike the north/south
// crossings above.
export const GRIMOAK_GROUNDS_MOAT_MID_ROW = Math.round((MOAT_INNER_TOP + MOAT_INNER_BOTTOM) / 2);

export function isBridgeTile(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  const onSouthBridge = row >= MOAT_INNER_BOTTOM && row <= MOAT_OUTER_BOTTOM && col >= BRIDGE_COL_LEFT && col <= BRIDGE_COL_RIGHT;
  // A later follow-up ask: "the same bridge and gate mechanism going
  // north" — a second crossing, mirrored top-to-bottom off the exact same
  // column span, so a player can reach Bramwick (straight north, see
  // BRAMWICK_ENTRANCE_ROW below) without detouring all the way around the
  // moat's east or west side.
  const onNorthBridge = row >= MOAT_OUTER_TOP && row <= MOAT_INNER_TOP && col >= BRIDGE_COL_LEFT && col <= BRIDGE_COL_RIGHT;
  return onSouthBridge || onNorthBridge;
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

// ---------- Kortho's own "Shimmering Sea" (a later follow-up ask: "extend
// the land to the east by 5%... a body of water... half of the length of
// the road to kortho... at the end... another sandy piece of land 5% the
// width of the town... a dock... connects to the water") — three new
// strips appended to Kortho's own east edge, beyond its original TOWN_SIZE
// square (the shop-door grid stays untouched, all of it sits west of col
// 50). ----------
export const KORTHO_SAND_STRIP_WIDTH_TILES = Math.round(TOWN_SIZE * 0.05);
export const KORTHO_SEA_LENGTH_TILES = Math.round(ROAD_TO_KORTHO_COLS / 2);
export const KORTHO_NEAR_SAND_COL_START = TOWN_SIZE;
export const KORTHO_SEA_COL_START = KORTHO_NEAR_SAND_COL_START + KORTHO_SAND_STRIP_WIDTH_TILES;
export const KORTHO_SEA_COL_END = KORTHO_SEA_COL_START + KORTHO_SEA_LENGTH_TILES - 1;
export const KORTHO_FAR_SAND_COL_START = KORTHO_SEA_COL_END + 1;
export const KORTHO_COLS = KORTHO_FAR_SAND_COL_START + KORTHO_SAND_STRIP_WIDTH_TILES;
// A wooden dock (a later follow-up ask) — a walkable strip poking out
// from the town's own shore into the near edge of the sea, same
// "carve an exception out of the water-blocked ring" shape isBridgeTile
// already uses for the moat.
export const KORTHO_DOCK_LENGTH_TILES = 6;
export const KORTHO_DOCK_HALF_WIDTH_TILES = 2;

function isKorthoDockTile(row: number, col: number): boolean {
  return (
    row >= TOWN_MID_ROW - KORTHO_DOCK_HALF_WIDTH_TILES &&
    row <= TOWN_MID_ROW + KORTHO_DOCK_HALF_WIDTH_TILES &&
    col >= KORTHO_SEA_COL_START &&
    col < KORTHO_SEA_COL_START + KORTHO_DOCK_LENGTH_TILES
  );
}

export function isKorthoSeaBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Kortho') return false;
  if (col < KORTHO_SEA_COL_START || col > KORTHO_SEA_COL_END) return false;
  return !isKorthoDockTile(row, col);
}

// A later follow-up ask: "pets/animated dead/summons cannot travel over
// water" and "if a player lands on water... and they do not have a boat"
// both need one single "is this tile water" answer spanning EVERY body of
// water in the game — the moat, plus Kortho's own new sea — rather than
// each caller having to know and OR together every individual water
// feature itself.
export function isWaterBlocked(mapName: MapName, row: number, col: number): boolean {
  return isMoatBlocked(mapName, row, col) || isKorthoSeaBlocked(mapName, row, col);
}

// "If a player lands on water from flight wearing off and they do not
// have a boat... place their corpse on the nearest body of land" — a
// plain expanding-ring search outward from the drowning tile (bounded by
// the map's own size) for the first non-water, in-bounds tile; no other
// occupancy check (trees/buildings/etc) since a corpse doesn't block
// movement anyway. Falls back to the map's own dead center if somehow
// nothing qualifies within the search bound (should never happen — no
// water body in this game is anywhere near that large).
export function nearestLandTile(mapName: MapName, row: number, col: number): { row: number; col: number } {
  const map = getMap(mapName);
  const maxRadius = Math.max(map.rows, map.cols);
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== radius) continue;
        const r = row + dRow;
        const c = col + dCol;
        if (r < 0 || r >= map.rows || c < 0 || c >= map.cols) continue;
        if (!isWaterBlocked(mapName, r, c)) return { row: r, col: c };
      }
    }
  }
  return { row: Math.floor(map.rows / 2), col: Math.floor(map.cols / 2) };
}

// Just north of the south bridge, touching its inner (castle-side) end —
// a later follow-up ask moved the spawn here from just south of the
// bridge, so a new (or respawning) player already stands at the bridge's
// far end facing the castle, rather than needing to cross it first.
export const GRIMOAK_GROUNDS_SPAWN = { row: MOAT_INNER_BOTTOM - 1, col: CASTLE_DOOR_ON_GROUNDS.col };

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
// The north bridge's own gate (a later follow-up ask, "the same bridge
// and gate mechanism going north") — sits at the north bridge's outer
// end, same width, same open/closed mechanics (see
// WorldManagerService.isGateOpen, now parameterized by which gate row is
// being checked instead of assuming the south one).
export const NORTH_GATE_ROW = MOAT_OUTER_TOP;
export const GATE_COL_LEFT = BRIDGE_COL_LEFT;
export const GATE_COL_RIGHT = BRIDGE_COL_RIGHT;
// "When a player gets within a couple of feet of it" — same ~2.5ft/tile
// convention SHOP_REACH_TILES/BED_REACH_TILES already use elsewhere.
export const GATE_REACH_TILES = 2;

export function isGateTile(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Grimoak Grounds') return false;
  return (row === GATE_ROW || row === NORTH_GATE_ROW) && col >= GATE_COL_LEFT && col <= GATE_COL_RIGHT;
}

// Where a brand new (or respawning) character appears on a given map —
// only Grimoak Grounds has an explicit spawn point (its door is no longer
// centered); everything else still falls back to the map's own center.
export function startingPositionFor(mapName: MapName): { row: number; col: number } {
  if (mapName === 'Grimoak Grounds') return GRIMOAK_GROUNDS_SPAWN;
  // A later follow-up ask ("travelling to Floro/Kortho adds it to the
  // player's recall list") surfaced a real bug in the generic map-center
  // fallback below: Kortho/Floro's own dead-center tile (25, 25) now sits
  // inside the row-32/row-15 shop rows' own building collision footprint
  // (see isShopBuildingBlocked) — recalling there would land the player
  // inside a wall. Landing just inside each town's own entrance street
  // instead, clear of every shop's footprint.
  if (mapName === 'Kortho') return { row: TOWN_MID_ROW, col: 5 };
  if (mapName === 'Floro') return { row: 5, col: TOWN_MID_COL };
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
// A later follow-up ask: "their exit position is north of the stairs,
// not in the same position against the wall" — arriving via stairs used
// to land the player directly ON the destination's own stairs tile
// (FLOOR_LANDING_ROWS - 1, the south wall); one tile further in (north)
// instead, at every floorLandingDefinition call site below.
const FLOOR_LANDING_STAIRS_ARRIVAL_ROW = FLOOR_LANDING_ROWS - 2;

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
  { col: 8, name: 'Shaman Chamber' },
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
  { toMap: 'Grimoak Entrance Hall', toRow: ENTRANCE_HALL_UP_STAIRS.row - 1, toCol: ENTRANCE_HALL_UP_STAIRS.col },
  { toMap: 'Grimoak Castle 3rd Floor', toRow: FLOOR_LANDING_STAIRS_ARRIVAL_ROW, toCol: FLOOR_LANDING_DOWN_STAIRS_COL }
);
const FLOOR3_LANDING = floorLandingDefinition(
  'Grimoak Castle 3rd Floor',
  FLOOR3_CHAMBER_DOORS,
  { toMap: 'Grimoak Castle 2nd Floor', toRow: FLOOR_LANDING_STAIRS_ARRIVAL_ROW, toCol: FLOOR_LANDING_UP_STAIRS_COL },
  { toMap: 'Grimoak Castle 4th Floor', toRow: FLOOR_LANDING_STAIRS_ARRIVAL_ROW, toCol: FLOOR_LANDING_DOWN_STAIRS_COL }
);
// Floor 4 has no chambers of its own (no north-wall doors) and nothing
// above it — just the down-stairs back to floor 3, plus 4 portals (a
// later follow-up ask made these real exits — see the block below that
// pushes them on, same "define the room, then push an additional exit
// once the target's own info is known" shape the Entrance Hall's own
// up-stairs already uses).
const FLOOR4_LANDING = floorLandingDefinition('Grimoak Castle 4th Floor', [], {
  toMap: 'Grimoak Castle 3rd Floor',
  toRow: FLOOR_LANDING_STAIRS_ARRIVAL_ROW,
  toCol: FLOOR_LANDING_UP_STAIRS_COL,
});

// ---------- The 4th floor's 4 portals, each a real exit now (a later
// follow-up ask: "add some places the portals will take the player,
// like level 10-15 monsters, 15-20, 20-30, 30-40") — one small dungeon
// each, roughly scaled to that level range. Positions duplicated from
// shared/lighting.ts's own portalPositionsFor (maps.ts can't import that
// file — lighting.ts already imports FROM maps.ts, so the reverse would
// be circular) rather than shared, but computed from the exact same
// constants so the two can never actually drift apart. Portal 1-4 order
// (see WorldScene's own portalPositionsFor().map/index) is north, south,
// east, west. ----------
// Exported (a later follow-up ask: "there is no exit portal in the
// worlds you created that the portals take you to") — shared/lighting.ts's
// portalPositionsFor needs these same figures to render each dungeon's
// own return portal at the exact tile its exit sits on.
export const PORTAL_DUNGEON_SIZE_ROWS = 40;
export const PORTAL_DUNGEON_SIZE_COLS = 50;
export const PORTAL_DUNGEON_MID_COL = Math.floor(PORTAL_DUNGEON_SIZE_COLS / 2);
export const PORTAL_DUNGEON_MAPS = ['Sunken Crypt', 'Goblin Warcamp', 'Imp Hollow', 'Ashen Wastes'] as const;

// `returnRow`/`returnCol` (a later follow-up ask: "the exit portal should
// take you back next to the portal you had originally gone into") — each
// of the 4 dungeons now returns to the ONE TILE INSIDE its own specific
// 4th-floor portal (not a shared central point every dungeon used to
// dump the player back at), same "arrival one tile in from the edge"
// convention FLOOR_LANDING_STAIRS_ARRIVAL_ROW already uses for stairs.
function portalDungeonDefinition(name: MapName, returnRow: number, returnCol: number): MapDefinition {
  return {
    name,
    rows: PORTAL_DUNGEON_SIZE_ROWS,
    cols: PORTAL_DUNGEON_SIZE_COLS,
    terrain: 'stone',
    exits: [
      {
        row: PORTAL_DUNGEON_SIZE_ROWS - 1,
        col: PORTAL_DUNGEON_MID_COL,
        direction: 'south',
        toMap: 'Grimoak Castle 4th Floor',
        toRow: returnRow,
        toCol: returnCol,
        kind: 'open',
      },
    ],
  };
}

const FLOOR4_PORTAL_MID_COL = Math.floor(FLOOR_LANDING_COLS / 2);
FLOOR4_LANDING.exits.push(
  {
    row: 0,
    col: FLOOR4_PORTAL_MID_COL,
    direction: 'north',
    toMap: 'Sunken Crypt',
    toRow: PORTAL_DUNGEON_SIZE_ROWS - 2,
    toCol: PORTAL_DUNGEON_MID_COL,
    kind: 'open',
  },
  {
    row: FLOOR_LANDING_ROWS - 1,
    col: FLOOR4_PORTAL_MID_COL,
    direction: 'south',
    toMap: 'Goblin Warcamp',
    toRow: PORTAL_DUNGEON_SIZE_ROWS - 2,
    toCol: PORTAL_DUNGEON_MID_COL,
    kind: 'open',
  },
  {
    row: FLOOR_LANDING_MID_ROW,
    col: FLOOR_LANDING_COLS - 1,
    direction: 'east',
    toMap: 'Imp Hollow',
    toRow: PORTAL_DUNGEON_SIZE_ROWS - 2,
    toCol: PORTAL_DUNGEON_MID_COL,
    kind: 'open',
  },
  {
    row: FLOOR_LANDING_MID_ROW,
    col: 0,
    direction: 'west',
    toMap: 'Ashen Wastes',
    toRow: PORTAL_DUNGEON_SIZE_ROWS - 2,
    toCol: PORTAL_DUNGEON_MID_COL,
    kind: 'open',
  }
);

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
  toRow: FLOOR_LANDING_STAIRS_ARRIVAL_ROW,
  toCol: FLOOR_LANDING_DOWN_STAIRS_COL,
});

const NECROMANCER_CHAMBER = chamberOffFloorLanding('Necromancer Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
const SHAMAN_CHAMBER = chamberOffFloorLanding('Shaman Chamber', 'Grimoak Castle 2nd Floor', FLOOR2_CHAMBER_DOORS);
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
// Exported (a later follow-up ask needed it client-side, to size the new
// Brimstone Cave/Runestone Way/Silverbranch Road connections' own sign
// placement relative to Bramwick's own edges).
export const BRAMWICK_SIZE = 40;
const BRAMWICK_MID_COL = Math.floor(BRAMWICK_SIZE / 2);

const BRAMWICK_SHOP_DOORS: Record<(typeof BRAMWICK_SHOP_MAPS)[number], { row: number; col: number }> = {
  'Bramwick General Shop': { row: 10, col: 10 },
  'Bramwick Weapons': { row: 10, col: 30 },
  'Bramwick Armor': { row: 28, col: 10 },
  'Bramwick Potions': { row: 28, col: 30 },
  // Phase C's "pet shop cottage" — centered on the top row, between the
  // two existing front shops, with plenty of clearance on both sides.
  'Bramwick Pet Shop': { row: 10, col: BRAMWICK_MID_COL },
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
      // A later follow-up ask: "remove the wooden doors from in front of
      // the shops... walking into the shop spritesheet's door should
      // make the player enter" — no separate GRAND_DOOR sprite anymore
      // (see WorldScene's renderDoorsAndChest); this exact tile is now
      // anchored directly under the cottage's own baked-in door art (see
      // WorldScene's cottageSprites positioning) instead.
      kind: 'open',
    };
  });
}

// A later follow-up ask: "the shops in the towns don't seem to have
// collision, update it so they have collision, players should be able to
// walk into the shops through the door" — every shop building sprite
// (Floro's/Kortho's own dedicated art, Bramwick's cottages) was purely
// decorative until now, with nothing stopping a player from walking
// straight through its walls. Computed fresh from each door's own
// position (same "no caching, small array, called rarely" shape as
// torchWallPositionsFor) rather than hand-placed — widthTiles/heightTiles
// are each building's own real size in tiles (192x256px = 6x8 for Kortho/
// Bramwick, 96x112px = 3x4 (rounded up) for Floro — see mapRender.ts's own
// texture-frame constants, duplicated here as plain numbers rather than
// importing a client-only file into shared/, per this file's own
// no-cross-import convention). The door's own exit tile is deliberately
// EXCLUDED (dRow starts at 1, never 0) so walking through it still works.
function shopBuildingFootprint(door: { row: number; col: number }, widthTiles: number, heightTiles: number): Array<{ row: number; col: number }> {
  const halfWidth = Math.floor(widthTiles / 2);
  const tiles: Array<{ row: number; col: number }> = [];
  for (let dRow = 1; dRow < heightTiles; dRow++) {
    for (let dCol = -halfWidth; dCol < widthTiles - halfWidth; dCol++) {
      tiles.push({ row: door.row - dRow, col: door.col + dCol });
    }
  }
  return tiles;
}

export function isShopBuildingBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName === 'Floro') {
    return FLORO_SHOP_MAPS.some((name) => shopBuildingFootprint(FLORO_SHOP_DOORS[name], 3, 4).some((t) => t.row === row && t.col === col));
  }
  if (mapName === 'Kortho') {
    return KORTHO_SHOP_MAPS.some((name) => shopBuildingFootprint(KORTHO_SHOP_DOORS[name], 6, 8).some((t) => t.row === row && t.col === col));
  }
  if (mapName === 'Bramwick') {
    return BRAMWICK_SHOP_MAPS.some((name) => shopBuildingFootprint(BRAMWICK_SHOP_DOORS[name], 6, 8).some((t) => t.row === row && t.col === col));
  }
  if (mapName === 'Gobbler Village') {
    // Gobbler Village's own huts are smaller than the town buildings above
    // — 128x160px = 4x5 tiles (see mapRender.ts's GOBBLER_HUT_FRAME_WIDTH/
    // HEIGHT, duplicated here as plain numbers per this file's own
    // no-cross-import convention).
    return GOBBLER_VILLAGE_HUT_MAPS.some((name) => shopBuildingFootprint(GOBBLER_HUT_DOORS[name], 4, 5).some((t) => t.row === row && t.col === col));
  }
  return false;
}

// Bramwick's own south entrance — a dirt road leading north from Grimoak
// Grounds (see the new north-wall exit added to Grimoak Grounds' own
// MAPS entry below), with a clickable name sign just inside (see
// shared/lighting.ts's BRAMWICK_SIGN_POSITION). A later follow-up ask
// removed the door there entirely ("the players should just walk
// straight through") — see this exit's own `kind: 'open'` below — and
// added a visibly different-colored dirt patch on the GROUNDS side (see
// WorldScene's own renderMap), "about 10 feet" (the ~2.5ft/tile
// convention SHOP_REACH_TILES/BED_REACH_TILES already use elsewhere
// puts that at 4 tiles) leading south from the shared entrance tile,
// same width as the castle's own bridge for a visually consistent
// "road" feel.
const BRAMWICK_ENTRANCE_ROW = BRAMWICK_SIZE - 1;
export const GRIMOAK_GROUNDS_ROAD_ROWS = 4;
export const GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES = 2;

// A later follow-up ask: "make the entire dirt road width also the width
// of the space the player can walk through" — a single-tile exit choke
// point (the original shape) let the road LOOK several tiles wide while
// only its exact center column actually transitioned; one exit per
// column across the same width the road is drawn (see WorldScene's own
// roadTile), each preserving its own column on both sides so walking
// north/south anywhere across the road's width lands you at the
// matching lateral position on the other side, not funneled to center.
function bramwickGroundsEntranceExits(direction: 'north' | 'south'): MapExit[] {
  const exits: MapExit[] = [];
  for (let dCol = -GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES; dCol <= GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES; dCol++) {
    exits.push(
      direction === 'north'
        ? {
            row: 0,
            col: CASTLE_DOOR_ON_GROUNDS.col + dCol,
            direction: 'north',
            toMap: 'Bramwick',
            toRow: BRAMWICK_ENTRANCE_ROW,
            toCol: BRAMWICK_MID_COL + dCol,
            kind: 'open',
          }
        : {
            row: BRAMWICK_ENTRANCE_ROW,
            col: BRAMWICK_MID_COL + dCol,
            direction: 'south',
            toMap: 'Grimoak Grounds',
            toRow: 0,
            toCol: CASTLE_DOOR_ON_GROUNDS.col + dCol,
            kind: 'open',
          }
    );
  }
  return exits;
}

export { BRAMWICK_MID_COL, BRAMWICK_ENTRANCE_ROW };

// A later follow-up ask generalized bramwickGroundsEntranceExits' own
// fix ("the entire width/height of the dirt roads... should allow the
// player to walk through at any part of it... instead of showing the
// message 'You can't go that way'") to every OTHER road junction this
// project has since added (Road to Kortho/Kortho, Road to Floro/Floro),
// which had regressed back to a single-tile choke point — one exit per
// tile across the road's own half-width band, each preserving its own
// lateral offset on both sides. `spread` picks which coordinate the band
// varies across: 'row' for an east-west road (Road to Kortho), 'col' for
// a north-south one (Road to Floro).
function roadBandExits(config: {
  row: number;
  col: number;
  direction: Direction;
  toMap: MapName;
  toRow: number;
  toCol: number;
  halfWidthTiles: number;
  spread: 'row' | 'col';
}): MapExit[] {
  const exits: MapExit[] = [];
  for (let d = -config.halfWidthTiles; d <= config.halfWidthTiles; d++) {
    exits.push({
      row: config.spread === 'row' ? config.row + d : config.row,
      col: config.spread === 'col' ? config.col + d : config.col,
      direction: config.direction,
      toMap: config.toMap,
      toRow: config.spread === 'row' ? config.toRow + d : config.toRow,
      toCol: config.spread === 'col' ? config.toCol + d : config.toCol,
      kind: 'open',
    });
  }
  return exits;
}

// ---------- Gobbler Village (a later follow-up ask: "add a new World
// from the southeast of Grimoak Grounds called 'Gobbler Village'... a
// small village structure with huts to go into... torches that light it
// up at night") — same overall shape as Bramwick (a small village, a
// handful of plain enterable buildings, day/night standing torches, same
// dirt street texture and map SIZE — "the map should be the same size as
// Bramwick's map"), just connected off Grimoak Grounds' own SE corner
// instead of straight north, with huts instead of shops. ----------
export const GOBBLER_VILLAGE_SIZE = BRAMWICK_SIZE;
export const GOBBLER_VILLAGE_MID = Math.floor(GOBBLER_VILLAGE_SIZE / 2);
// Where Grimoak Grounds' own new SE exit sits — well south of the moat
// (MOAT_OUTER_BOTTOM is row 62) and at the map's own far east edge, same
// "southeast" placement the ask itself describes.
export const GRIMOAK_GROUNDS_GOBBLER_VILLAGE_ROW = 75;

const GOBBLER_HUT_DOORS: Record<(typeof GOBBLER_VILLAGE_HUT_MAPS)[number], { row: number; col: number }> = {
  'Gobbler Hut 1': { row: 10, col: 14 },
  'Gobbler Hut 2': { row: 10, col: 26 },
  'Gobbler Hut 3': { row: 28, col: GOBBLER_VILLAGE_MID },
};

function gobblerHutInteriorDefinition(name: (typeof GOBBLER_VILLAGE_HUT_MAPS)[number]): MapDefinition {
  const door = GOBBLER_HUT_DOORS[name];
  return {
    name,
    rows: SHOP_INTERIOR_SIZE,
    cols: SHOP_INTERIOR_SIZE,
    // Unused metadata (see MapTerrain's own doc comment) — the real
    // texture comes from mapRender.ts's floorTextureFor (dirt, matching
    // the huts' own rustic feel, not the stone Floro/Kortho/Bramwick's
    // own SHOPS use).
    terrain: 'stone',
    exits: [
      {
        row: SHOP_INTERIOR_DOOR_ROW,
        col: SHOP_INTERIOR_MID_COL,
        direction: 'south',
        toMap: 'Gobbler Village',
        toRow: door.row,
        toCol: door.col,
      },
    ],
  };
}

function gobblerHutDoorExits(): MapExit[] {
  return GOBBLER_VILLAGE_HUT_MAPS.map((name) => {
    const door = GOBBLER_HUT_DOORS[name];
    return {
      row: door.row,
      col: door.col,
      direction: 'north',
      toMap: name,
      toRow: SHOP_INTERIOR_DOOR_ROW,
      toCol: SHOP_INTERIOR_MID_COL,
      // Same "walk into the hut's own baked-in door" treatment Bramwick's
      // cottages already use — no separate door sprite.
      kind: 'open',
    };
  });
}

// A later follow-up ask: "add a connection to the west of Floro with a
// thin dirt road... Create the world 'The Great Plains' (or re-use the
// old Great Plains)... have it have a dirt road connection at the top
// right/north east with sign 'Floro'." Great Plains already existed as a
// real map (with its own wild goblins/trees, see server/monsters/
// monster.ts and shared/trees.ts) but had been entirely unreachable since
// Floro/Kortho were rebuilt on their own "Road to..." corridors — this
// re-links it via a single direct shared border, same shape as Bramwick/
// Mystical Timberland/Gobbler Village's own connections to Grimoak
// Grounds, rather than a separate corridor map (nothing here was asked
// for a "Road to Great Plains" in between). Northeast placement on Great
// Plains' own side mirrors how "Road to Kortho" sits at the NE of
// Grimoak Grounds as an EAST-facing exit near the top of that map, not
// dead center.
export const GREAT_PLAINS_FLORO_ROW = 15;
export const GREAT_PLAINS_FLORO_HALF_WIDTH_TILES = 2;
export const FLORO_GREAT_PLAINS_ROW = TOWN_MID_ROW;

// ---------- Hexstone Cavern (a later follow-up ask: "create a cave
// entrance at the northwest/north of the great plains... the player
// should walk through the cave entrance... create a new world called
// 'Hexstone Cavern'... a connection to the great plains from the
// southeast/south") — same direct shared-border shape as the Floro
// connection above, no door on either side (walk straight through the
// cave-mouth sprite itself, see WorldScene's own renderDoorsAndChest).
// ----------
export const GREAT_PLAINS_HEXSTONE_ROW = 15;
export const GREAT_PLAINS_HEXSTONE_HALF_WIDTH_TILES = 2;
export const HEXSTONE_CAVERN_SIZE = GREAT_PLAINS_SIZE;
// "From the southeast/south" — the south edge, offset toward the east
// side of it rather than dead center.
export const HEXSTONE_GREAT_PLAINS_COL = Math.round(HEXSTONE_CAVERN_SIZE * 0.75);

// ---------- Brimstone Cave (a later follow-up ask: "add a cave
// connection to the west of Bramwick... make it the same size as
// Hexstone Cavern... a cave connection east with sign 'Bramwick'") — same
// direct shared-border, no-door shape as the Great Plains <-> Hexstone
// Cavern connection above, reusing the same generic cave-mouth sprite. ----------
export const BRIMSTONE_CAVE_SIZE = HEXSTONE_CAVERN_SIZE;
export const BRIMSTONE_CAVE_MID_ROW = Math.floor(BRIMSTONE_CAVE_SIZE / 2);
export const BRAMWICK_BRIMSTONE_ROW = Math.floor(BRAMWICK_SIZE / 2);
export const BRAMWICK_BRIMSTONE_HALF_WIDTH_TILES = 2;

// ---------- Runestone Way (a later follow-up ask: "a dirt road
// connection to the north of Bramwick with sign 'Boulder Pass'... like
// the road to floro, except this goes north... instead of the grass on
// either side, create boulders and rocks and impassable looking
// terrain... collision on the side of the road so the player is only
// able to walk on the road") — same north-south corridor shape as Road
// to Floro (see ROAD_TO_FLORO_ROWS/COLS's own doc comment for the same
// "ROWS matches the big map's own size, COLS is a thin 25% slice" ratio,
// here relative to Bramwick instead of Grimoak Grounds), but with real
// off-road collision (see isRunestoneWayOffRoadBlocked below) instead of
// merely-decorative grass, and no second connection at its own far end
// (nothing was asked to be there yet — a dead end for now). ----------
export const RUNESTONE_WAY_ROWS = BRAMWICK_SIZE;
export const RUNESTONE_WAY_COLS = Math.round(BRAMWICK_SIZE * 0.25);
export const RUNESTONE_WAY_MID_COL = Math.floor(RUNESTONE_WAY_COLS / 2);
export const RUNESTONE_WAY_HALF_WIDTH_TILES = 2;
// Bramwick's own north-edge column for this connection — NOT
// BRAMWICK_MID_COL (20): the Pet Shop's own door sits at (10,
// BRAMWICK_MID_COL) with its building footprint reaching rows 3-9 at
// cols 17-22 (see BRAMWICK_SHOP_DOORS/shopBuildingFootprint), directly in
// the path north from the map's own top edge. 36 sits in the clear gap
// east of the Weapons shop's own footprint (cols 27-32).
export const BRAMWICK_RUNESTONE_COL = 36;

// Blocks every tile OFF the walkable road band — the "boulders and rocks
// and impassable looking terrain" flanking it. Never bypassed by flying
// (same "solid obstacle, not water" treatment isCastleExteriorBlocked/
// isTreeTile already get — see world-manager.service.ts's isOccupied).
export function isRunestoneWayOffRoadBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Runestone Way') return false;
  return col < RUNESTONE_WAY_MID_COL - RUNESTONE_WAY_HALF_WIDTH_TILES || col > RUNESTONE_WAY_MID_COL + RUNESTONE_WAY_HALF_WIDTH_TILES;
}

// ---------- Silverbranch Road (a later follow-up ask: "a dirt road
// connection to the east of Bramwick with sign 'Silverbranch Road'...
// like the road to kortho going east... a dirt road connection to the
// west for Bramwick with sign 'Bramwick'... trees on the grass with
// silver branches with collision") — same east-west corridor shape as
// Road to Kortho, relative to Bramwick instead of Grimoak Grounds, plain
// grass (not boulder-walled like Runestone Way above) with real trees
// (see shared/trees.ts's own silverbranchRoadTreePositions) rather than
// a blanket off-road wall. No second connection at its own far end,
// same "nothing asked for there yet" reasoning as Runestone Way. ----------
export const SILVERBRANCH_ROAD_ROWS = Math.round(BRAMWICK_SIZE * 0.25);
export const SILVERBRANCH_ROAD_COLS = BRAMWICK_SIZE;
export const SILVERBRANCH_ROAD_MID_ROW = Math.floor(SILVERBRANCH_ROAD_ROWS / 2);
export const SILVERBRANCH_ROAD_HALF_WIDTH_TILES = 2;
export const BRAMWICK_SILVERBRANCH_ROW = Math.floor(BRAMWICK_SIZE / 2);

// ---------- Direfell (a later follow-up ask: "add a 1 tile dirt road
// connection (with no door) at the northeast/east of Kortho on the sandy
// beach area... make the new world Direfell be half the size of
// Kortho... a dirt road connection to the southwest/west with sign
// 'Kortho'") — unlike every other connection in this file, a single
// CHOKE-POINT tile (halfWidthTiles 0), not the usual multi-tile band, per
// the user's own explicit "1 tile" ask. "Half the size of Kortho" reads
// as half of Kortho's own original town square (TOWN_SIZE), not the much
// longer sand/sea/sand-extended KORTHO_COLS. ----------
export const DIREFELL_SIZE = Math.round(TOWN_SIZE / 2);
// "Northeast/east" — Kortho's own far (east) sand strip, toward the
// north/top of it.
export const KORTHO_DIREFELL_ROW = 15;
// "Southwest/west" — Direfell's own west edge, toward the south/bottom.
export const DIREFELL_KORTHO_ROW = DIREFELL_SIZE - 6;

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
      // A later follow-up ask: "it should have a dirt road connection at
      // the top right/north east with sign 'Floro'... it should connect
      // to Floro" — replaces the old stale west/east exits above (which
      // pointed at Floro's/Kortho's own long-since-rebuilt street layouts
      // and had no reciprocal door on either side) with the one real,
      // signed connection actually asked for.
      ...roadBandExits({
        row: GREAT_PLAINS_FLORO_ROW,
        col: GREAT_PLAINS_SIZE - 1,
        direction: 'east',
        toMap: 'Floro',
        toRow: FLORO_GREAT_PLAINS_ROW,
        toCol: 1,
        halfWidthTiles: GREAT_PLAINS_FLORO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      // A later follow-up ask: "create a cave entrance at the northwest/
      // north of the great plains... create a new world called 'Hexstone
      // Cavern'" — the west edge, near the top (mirroring how the Floro
      // exit above sits on the EAST edge near the top for "northeast").
      ...roadBandExits({
        row: GREAT_PLAINS_HEXSTONE_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Hexstone Cavern',
        toRow: HEXSTONE_CAVERN_SIZE - 2,
        toCol: HEXSTONE_GREAT_PLAINS_COL,
        halfWidthTiles: GREAT_PLAINS_HEXSTONE_HALF_WIDTH_TILES,
        spread: 'row',
      }),
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
  'Hexstone Cavern': {
    name: 'Hexstone Cavern',
    rows: HEXSTONE_CAVERN_SIZE,
    cols: HEXSTONE_CAVERN_SIZE,
    // Unused metadata — real texture is 'cave' via floorTextureFor, same
    // "MapTerrain only ever drives movement cost, not the actual visual"
    // shape every other map's own terrain field already has.
    terrain: 'stone',
    exits: [
      // A later follow-up ask: "make it have a connection to the great
      // plains from the southeast/south... a cave entrance/exit sprite
      // with a sign next to it 'The Great Plains'" — south edge, offset
      // toward the east (see HEXSTONE_GREAT_PLAINS_COL's own doc comment).
      ...roadBandExits({
        row: HEXSTONE_CAVERN_SIZE - 1,
        col: HEXSTONE_GREAT_PLAINS_COL,
        direction: 'south',
        toMap: 'Great Plains',
        toRow: GREAT_PLAINS_HEXSTONE_ROW,
        toCol: 1,
        halfWidthTiles: GREAT_PLAINS_HEXSTONE_HALF_WIDTH_TILES,
        spread: 'col',
      }),
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
      // A later follow-up ask reconnected Floro via the new "Road to
      // Floro" corridor instead (see its own MapDefinition below) — the
      // stale Great Plains link is gone, same "Add X back" treatment
      // Kortho's own stale west exit already got earlier this batch. A
      // further follow-up ask widened this from a single choke-point tile
      // to the road's own full width (see roadBandExits).
      ...roadBandExits({
        row: 0,
        col: TOWN_MID_COL,
        direction: 'north',
        toMap: 'Road to Floro',
        toRow: ROAD_TO_FLORO_ROWS - 2,
        toCol: ROAD_TO_FLORO_MID_COL,
        halfWidthTiles: ROAD_TO_FLORO_HALF_WIDTH_TILES,
        spread: 'col',
      }),
      // A later follow-up ask: "add a connection to the west of Floro
      // with a thin dirt road for the exit and a sign with 'The Great
      // Plains'" — re-links Floro to the Great Plains map (see
      // GREAT_PLAINS_FLORO_ROW's own doc comment above), well clear of
      // every shop door (all of which sit at cols 10-40, nowhere near
      // this west edge).
      ...roadBandExits({
        row: FLORO_GREAT_PLAINS_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Great Plains',
        toRow: GREAT_PLAINS_FLORO_ROW,
        toCol: GREAT_PLAINS_SIZE - 2,
        halfWidthTiles: GREAT_PLAINS_FLORO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
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
    // Widened east (a later follow-up ask) to fit a new sand/sea/sand strip
    // beyond the original stone town square — see KORTHO_COLS's own doc
    // comment above.
    cols: KORTHO_COLS,
    // Same reasoning as Floro above.
    terrain: 'stone',
    exits: [
      // A later follow-up ask ("add the town of Kortho back... connect it
      // to the Road to Kortho") replaced the old (long-orphaned, since
      // Great Plains isn't reachable from anywhere in the current
      // Grimoak-centric world) exit back to Great Plains with the real
      // new connection. A further follow-up ask widened this from a
      // single choke-point tile to the road's own full width (see
      // roadBandExits) — no separate door sprite either ("remove the
      // door... walking into that direction should take the character
      // into the respective area"), same plain dirt-road walk-through as
      // Bramwick's own entrance.
      ...roadBandExits({
        row: TOWN_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Road to Kortho',
        toRow: ROAD_TO_KORTHO_MID_ROW,
        toCol: ROAD_TO_KORTHO_COLS - 2,
        halfWidthTiles: ROAD_TO_KORTHO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      ...korthoShopDoorExits(),
      // A later follow-up ask: "add a 1 tile dirt road connection (with
      // no door) at the northeast/east of Kortho on the sandy beach area
      // with a sign against the edge reading 'Direfell'" — a single
      // choke-point tile on the far (east) sand strip, unlike every
      // other connection's own multi-tile band.
      {
        row: KORTHO_DIREFELL_ROW,
        col: KORTHO_COLS - 1,
        direction: 'east',
        toMap: 'Direfell',
        toRow: DIREFELL_KORTHO_ROW,
        toCol: 1,
        kind: 'open',
      },
    ],
  },
  'Kortho Blacksmith': korthoShopInteriorDefinition('Kortho Blacksmith'),
  'Kortho General Store': korthoShopInteriorDefinition('Kortho General Store'),
  'Kortho Inn': korthoShopInteriorDefinition('Kortho Inn'),
  'Kortho Bank': korthoShopInteriorDefinition('Kortho Bank'),
  'Kortho Armorer': korthoShopInteriorDefinition('Kortho Armorer'),
  'Kortho Pet Salesman': korthoShopInteriorDefinition('Kortho Pet Salesman'),
  'Kortho Boat Shop': korthoShopInteriorDefinition('Kortho Boat Shop'),
  'Road to Kortho': {
    name: 'Road to Kortho',
    rows: ROAD_TO_KORTHO_ROWS,
    cols: ROAD_TO_KORTHO_COLS,
    // The dirt road itself is a client-side TileSprite overlay (see
    // WorldScene's own renderMap, same technique as the Grimoak Grounds
    // <-> Bramwick road) — the base terrain underneath is grass, matching
    // "a dirt road... with grass surrounding it on either side." A later
    // follow-up ask removed the original stone stretch near Kortho —
    // it's all dirt now, the whole way.
    terrain: 'grass',
    exits: [
      ...roadBandExits({
        row: ROAD_TO_KORTHO_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Grimoak Grounds',
        toRow: GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW,
        toCol: GRIMOAK_GROUNDS_COLS - 2,
        halfWidthTiles: ROAD_TO_KORTHO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      ...roadBandExits({
        row: ROAD_TO_KORTHO_MID_ROW,
        col: ROAD_TO_KORTHO_COLS - 1,
        direction: 'east',
        toMap: 'Kortho',
        toRow: TOWN_MID_ROW,
        toCol: 1,
        halfWidthTiles: ROAD_TO_KORTHO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
    ],
  },
  Direfell: {
    name: 'Direfell',
    rows: DIREFELL_SIZE,
    cols: DIREFELL_SIZE,
    // Unused metadata — real texture is 'haunted-forest' via
    // floorTextureFor.
    terrain: 'grass',
    exits: [
      // The reciprocal single-tile connection back to Kortho (a later
      // follow-up ask: "a dirt road connection to the southwest/west
      // with sign 'Kortho'... it should connect to kortho").
      {
        row: DIREFELL_KORTHO_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Kortho',
        toRow: KORTHO_DIREFELL_ROW,
        toCol: KORTHO_COLS - 2,
        kind: 'open',
      },
    ],
  },
  'Road to Floro': {
    name: 'Road to Floro',
    rows: ROAD_TO_FLORO_ROWS,
    cols: ROAD_TO_FLORO_COLS,
    // Same overlay approach as Road to Kortho above — base terrain is
    // grass, the dirt road itself is a client-side TileSprite (see
    // WorldScene's own renderMap).
    terrain: 'grass',
    exits: [
      ...roadBandExits({
        row: 0,
        col: ROAD_TO_FLORO_MID_COL,
        direction: 'north',
        toMap: 'Grimoak Grounds',
        toRow: GRIMOAK_GROUNDS_ROWS - 2,
        toCol: GRIMOAK_GROUNDS_ROAD_TO_FLORO_COL,
        halfWidthTiles: ROAD_TO_FLORO_HALF_WIDTH_TILES,
        spread: 'col',
      }),
      ...roadBandExits({
        row: ROAD_TO_FLORO_ROWS - 1,
        col: ROAD_TO_FLORO_MID_COL,
        direction: 'south',
        toMap: 'Floro',
        toRow: 1,
        toCol: TOWN_MID_COL,
        halfWidthTiles: ROAD_TO_FLORO_HALF_WIDTH_TILES,
        spread: 'col',
      }),
    ],
  },
  'Mystical Timberland': {
    name: 'Mystical Timberland',
    rows: MYSTICAL_TIMBERLAND_ROWS,
    cols: MYSTICAL_TIMBERLAND_COLS,
    // The base floor is grass (see mapRender.ts's floorTextureFor, a
    // later follow-up ask: "make the grass slightly darker than in
    // Grimoak Grounds") — the actual maze-like feel comes from its own
    // dense tree scatter (see shared/trees.ts's mysticalTimberlandTreePositions,
    // wired into collision the same way Great Plains' own trees already
    // are), not this field.
    terrain: 'grass',
    exits: [
      ...roadBandExits({
        row: MYSTICAL_TIMBERLAND_MID_ROW,
        col: MYSTICAL_TIMBERLAND_COLS - 1,
        direction: 'east',
        toMap: 'Grimoak Grounds',
        toRow: GRIMOAK_GROUNDS_MOAT_MID_ROW,
        toCol: 1,
        halfWidthTiles: GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
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
      ...bramwickGroundsEntranceExits('south'),
      ...bramwickShopDoorExits(),
      // A later follow-up ask: "a cave connection to the west of
      // Bramwick with a sign that reads 'Brimstone Cave'."
      ...roadBandExits({
        row: BRAMWICK_BRIMSTONE_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Brimstone Cave',
        toRow: BRIMSTONE_CAVE_MID_ROW,
        toCol: BRIMSTONE_CAVE_SIZE - 2,
        halfWidthTiles: BRAMWICK_BRIMSTONE_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      // A later follow-up ask: "a dirt road connection to the north of
      // Bramwick with sign 'Boulder Pass'" — Bramwick's own top edge is
      // free (its existing entrance sits on the SOUTH edge, back toward
      // Grimoak Grounds).
      ...roadBandExits({
        row: 0,
        col: BRAMWICK_RUNESTONE_COL,
        direction: 'north',
        toMap: 'Runestone Way',
        toRow: RUNESTONE_WAY_ROWS - 2,
        toCol: RUNESTONE_WAY_MID_COL,
        halfWidthTiles: RUNESTONE_WAY_HALF_WIDTH_TILES,
        spread: 'col',
      }),
      // A later follow-up ask: "a dirt road connection to the east of
      // Bramwick with sign 'Silverbranch Road'."
      ...roadBandExits({
        row: BRAMWICK_SILVERBRANCH_ROW,
        col: BRAMWICK_SIZE - 1,
        direction: 'east',
        toMap: 'Silverbranch Road',
        toRow: SILVERBRANCH_ROAD_MID_ROW,
        toCol: 1,
        halfWidthTiles: SILVERBRANCH_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
    ],
  },
  'Bramwick General Shop': bramwickShopInteriorDefinition('Bramwick General Shop'),
  'Bramwick Weapons': bramwickShopInteriorDefinition('Bramwick Weapons'),
  'Bramwick Armor': bramwickShopInteriorDefinition('Bramwick Armor'),
  'Bramwick Potions': bramwickShopInteriorDefinition('Bramwick Potions'),
  'Bramwick Pet Shop': bramwickShopInteriorDefinition('Bramwick Pet Shop'),
  'Brimstone Cave': {
    name: 'Brimstone Cave',
    rows: BRIMSTONE_CAVE_SIZE,
    cols: BRIMSTONE_CAVE_SIZE,
    // Unused metadata — real texture is 'cave' via floorTextureFor, same
    // as Hexstone Cavern.
    terrain: 'stone',
    exits: [
      ...roadBandExits({
        row: BRIMSTONE_CAVE_MID_ROW,
        col: BRIMSTONE_CAVE_SIZE - 1,
        direction: 'east',
        toMap: 'Bramwick',
        toRow: BRAMWICK_BRIMSTONE_ROW,
        toCol: 1,
        halfWidthTiles: BRAMWICK_BRIMSTONE_HALF_WIDTH_TILES,
        spread: 'row',
      }),
    ],
  },
  'Runestone Way': {
    name: 'Runestone Way',
    rows: RUNESTONE_WAY_ROWS,
    cols: RUNESTONE_WAY_COLS,
    // Unused metadata — real texture is 'boulder-field' via
    // floorTextureFor; the walkable band itself is the usual dirt-road
    // TileSprite overlay (see WorldScene's own renderMap).
    terrain: 'stone',
    exits: [
      ...roadBandExits({
        row: RUNESTONE_WAY_ROWS - 1,
        col: RUNESTONE_WAY_MID_COL,
        direction: 'south',
        toMap: 'Bramwick',
        toRow: 1,
        toCol: BRAMWICK_RUNESTONE_COL,
        halfWidthTiles: RUNESTONE_WAY_HALF_WIDTH_TILES,
        spread: 'col',
      }),
    ],
  },
  'Silverbranch Road': {
    name: 'Silverbranch Road',
    rows: SILVERBRANCH_ROAD_ROWS,
    cols: SILVERBRANCH_ROAD_COLS,
    // Same overlay approach as Road to Kortho — base terrain is grass,
    // the dirt road itself is a client-side TileSprite.
    terrain: 'grass',
    exits: [
      ...roadBandExits({
        row: SILVERBRANCH_ROAD_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Bramwick',
        toRow: BRAMWICK_SILVERBRANCH_ROW,
        toCol: BRAMWICK_SIZE - 2,
        halfWidthTiles: SILVERBRANCH_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
    ],
  },
  'Gobbler Village': {
    name: 'Gobbler Village',
    rows: GOBBLER_VILLAGE_SIZE,
    cols: GOBBLER_VILLAGE_SIZE,
    // Unused metadata — real texture is 'dirt' via floorTextureFor,
    // "the same texture as in Bramwick."
    terrain: 'grass',
    exits: [
      ...roadBandExits({
        row: GOBBLER_VILLAGE_MID,
        col: 0,
        direction: 'west',
        toMap: 'Grimoak Grounds',
        toRow: GRIMOAK_GROUNDS_GOBBLER_VILLAGE_ROW,
        toCol: GRIMOAK_GROUNDS_COLS - 2,
        halfWidthTiles: GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      ...gobblerHutDoorExits(),
    ],
  },
  'Gobbler Hut 1': gobblerHutInteriorDefinition('Gobbler Hut 1'),
  'Gobbler Hut 2': gobblerHutInteriorDefinition('Gobbler Hut 2'),
  'Gobbler Hut 3': gobblerHutInteriorDefinition('Gobbler Hut 3'),
  'Grimoak Grounds': {
    name: 'Grimoak Grounds',
    rows: GRIMOAK_GROUNDS_ROWS,
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
        // A later follow-up ask: "remove the door from in front of
        // Grimoak Castle... walk into the castle spritesheet's door" —
        // the castle exterior's own glowing archway is ALREADY anchored
        // exactly on this tile (see WorldScene's castleExteriorSprites,
        // "positioned... so its glowing archway lines up with the actual
        // entrance tile"), so the separate GRAND_DOOR sprite here was
        // purely redundant, doubled-up art. The reciprocal exit inside
        // the Entrance Hall itself is untouched — that's an ordinary
        // room wall, not a spritesheet with its own painted door.
        kind: 'open',
      },
      // Bramwick's own south entrance sits directly north of the castle
      // door, straight up the open ground north of the moat (a later
      // follow-up ask: "a dirt road leading north").
      ...bramwickGroundsEntranceExits('north'),
      // A later follow-up ask: "at the northeast of Grimoak grounds add a
      // dirt road going east... Create 'Road to Kortho'" — well clear of
      // the moat/castle rectangle (rows 0-26 are open ground). A further
      // follow-up ask widened this from a single choke-point tile to the
      // road's own full width (see roadBandExits).
      ...roadBandExits({
        row: GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW,
        col: GRIMOAK_GROUNDS_COLS - 1,
        direction: 'east',
        toMap: 'Road to Kortho',
        toRow: ROAD_TO_KORTHO_MID_ROW,
        toCol: 1,
        halfWidthTiles: ROAD_TO_KORTHO_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      // A later follow-up ask: "at the southwest of grimoak grounds add a
      // dirt road... that goes south, leading to Floro" — sits in the new
      // south strip the Grounds' own 10% south expansion above just
      // created (the moat leaves almost no open ground west of it any
      // further north). Same full-width band treatment as the Kortho exit
      // above.
      ...roadBandExits({
        row: GRIMOAK_GROUNDS_ROWS - 1,
        col: GRIMOAK_GROUNDS_ROAD_TO_FLORO_COL,
        direction: 'south',
        toMap: 'Road to Floro',
        toRow: 1,
        toCol: ROAD_TO_FLORO_MID_COL,
        halfWidthTiles: ROAD_TO_FLORO_HALF_WIDTH_TILES,
        spread: 'col',
      }),
      // A later follow-up ask: "in the middle left (to the left of the
      // middle of the moat), make a connection to the new area Mystical
      // Timberland" — GRIMOAK_GROUNDS_MOAT_MID_ROW already sits well
      // clear of the moat's own footprint at col 0 (MOAT_OUTER_LEFT is
      // col 3), no bridge needed.
      ...roadBandExits({
        row: GRIMOAK_GROUNDS_MOAT_MID_ROW,
        col: 0,
        direction: 'west',
        toMap: 'Mystical Timberland',
        toRow: MYSTICAL_TIMBERLAND_MID_ROW,
        toCol: MYSTICAL_TIMBERLAND_COLS - 2,
        halfWidthTiles: GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
      // A later follow-up ask: "add a new World from the southeast of
      // Grimoak Grounds called 'Gobbler Village'" — well south of the
      // moat, at the map's own far east edge.
      ...roadBandExits({
        row: GRIMOAK_GROUNDS_GOBBLER_VILLAGE_ROW,
        col: GRIMOAK_GROUNDS_COLS - 1,
        direction: 'east',
        toMap: 'Gobbler Village',
        toRow: GOBBLER_VILLAGE_MID,
        toCol: 1,
        halfWidthTiles: GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES,
        spread: 'row',
      }),
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
  'Shaman Chamber': SHAMAN_CHAMBER,
  'Elementalist Chamber': ELEMENTALIST_CHAMBER,
  'Summoner Chamber': SUMMONER_CHAMBER,
  'Illusionist Chamber': ILLUSIONIST_CHAMBER,
  'Battlemage Chamber': BATTLEMAGE_CHAMBER,
  'Cleric Chamber': CLERIC_CHAMBER,
  'Druid Chamber': DRUID_CHAMBER,
  'Diabolist Chamber': DIABOLIST_CHAMBER,
  'Hemomancer Chamber': HEMOMANCER_CHAMBER,
  // Each dungeon's own return arrival — one tile IN from its own specific
  // 4th-floor portal (north/south/east/west, matching FLOOR4_LANDING's
  // own 4 pushed exits above), not a shared central point.
  'Sunken Crypt': portalDungeonDefinition('Sunken Crypt', 1, FLOOR4_PORTAL_MID_COL),
  'Goblin Warcamp': portalDungeonDefinition('Goblin Warcamp', FLOOR_LANDING_ROWS - 2, FLOOR4_PORTAL_MID_COL),
  'Imp Hollow': portalDungeonDefinition('Imp Hollow', FLOOR_LANDING_MID_ROW, FLOOR_LANDING_COLS - 2),
  'Ashen Wastes': portalDungeonDefinition('Ashen Wastes', FLOOR_LANDING_MID_ROW, 1),
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
