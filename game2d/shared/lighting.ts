import type { MapName } from './constants.js';
import {
  GRIMOAK_CASTLE_MAPS,
  CLASSROOM_MAPS,
  COMMON_ROOM_MAPS,
  DORM_MAPS,
  CASTLE_UPPER_FLOOR_MAPS,
  SPECIALIZATION_CHAMBER_MAPS,
  BRAMWICK_SHOP_MAPS,
  KORTHO_SHOP_MAPS,
  FLORO_SHOP_MAPS,
  GOBBLER_VILLAGE_HUT_MAPS,
} from './constants.js';
import { INFRAVISION_SKILL } from './skills.js';
import {
  getMap,
  CASTLE_DOOR_ON_GROUNDS,
  MOAT_INNER_LEFT,
  MOAT_INNER_RIGHT,
  MOAT_INNER_TOP,
  MOAT_INNER_BOTTOM,
  FLOOR_LANDING_ROWS,
  FLOOR_LANDING_COLS,
  FLOOR_LANDING_MID_ROW,
  BRAMWICK_MID_COL,
  BRAMWICK_ENTRANCE_ROW,
  PORTAL_DUNGEON_MAPS,
  PORTAL_DUNGEON_SIZE_ROWS,
  PORTAL_DUNGEON_MID_COL,
  GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW,
  GRIMOAK_GROUNDS_COLS,
  GRIMOAK_GROUNDS_ROWS,
  ROAD_TO_KORTHO_MID_ROW,
  ROAD_TO_KORTHO_COLS,
  GRIMOAK_GROUNDS_ROAD_TO_FLORO_COL,
  ROAD_TO_FLORO_ROWS,
  ROAD_TO_FLORO_MID_COL,
  TOWN_MID_ROW,
  TOWN_MID_COL,
  GRIMOAK_GROUNDS_MOAT_MID_ROW,
  MYSTICAL_TIMBERLAND_MID_ROW,
  MYSTICAL_TIMBERLAND_COLS,
  GRIMOAK_GROUNDS_GOBBLER_VILLAGE_ROW,
  GOBBLER_VILLAGE_MID,
  KORTHO_NEAR_SAND_COL_START,
  GREAT_PLAINS_FLORO_ROW,
  GREAT_PLAINS_SIZE,
  FLORO_GREAT_PLAINS_ROW,
  GREAT_PLAINS_HEXSTONE_ROW,
  HEXSTONE_CAVERN_SIZE,
  HEXSTONE_GREAT_PLAINS_COL,
} from './maps.js';

// "Late hours of night and early hours of morning" — a narrower, darker
// window nested inside the broader 18:00-6:00 "night" range the cosmetic
// day/night overlay already tints (see game.gateway.ts's worldHour).
// Outside this window, everyone can see normally regardless of light
// sources.
export const DARK_START_HOUR = 23;
export const DARK_END_HOUR = 6;

export function isDarkHour(hour: number): boolean {
  return hour >= DARK_START_HOUR || hour < DARK_END_HOUR;
}

// A finer-grained time-of-day label for the /time command (item 11) —
// dawn/morning/noon/evening/night instead of a flat day/night split.
// Ranges cover all 24 hours with no gaps: dawn (5-7), morning (7-12),
// noon (12-13), evening (13-19, folding the afternoon in rather than
// adding a 6th label nobody asked for), night (19-5).
export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'evening' | 'night';

export function timeOfDayLabel(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 13) return 'noon';
  if (hour >= 13 && hour < 19) return 'evening';
  return 'night';
}

// Originally "about a 10 foot diameter," doubled per request — a player's
// own light (or a nearby ally's, or a static fixture below) reaches this
// many tiles in every direction. Deliberately NOT reused for shop reach
// (see SHOP_REACH_TILES) — those are unrelated distances that happened to
// share a number before, not the same concept.
export const LIGHT_RADIUS_TILES = 4;

// The lucem spell's own wand-light radius — 25% bigger than a plain
// torch's (a follow-up ask: "expand the light from lucem by another 25%
// of what it already is," on top of it previously just reusing
// LIGHT_RADIUS_TILES outright).
export const LUCEM_LIGHT_RADIUS_TILES = Math.round(LIGHT_RADIUS_TILES * 1.25);

// How close a player needs to be to a vendor to open/use its shop — its
// own constant so widening the light radius above doesn't also widen how
// far away you can shop from.
export const SHOP_REACH_TILES = 2;

// "Within 3 feet of the bed" (a later follow-up ask) — shared so the
// client's own pre-flight reach check (before even opening the sleep
// confirmation modal) and the server's re-validation in
// handleSleepInBed always agree on the figure.
export const BED_REACH_TILES = 3;

// "When in range (2 feet)" (a follow-up ask) — shared so the client's own
// pre-flight reach check (before opening the rest-confirmation modal) and
// the server's re-validation in handleRestOnBench always agree.
export const BENCH_REACH_TILES = 2;

export const TORCH_ITEM = 'torch';

// A castle-sized fixture needs a much bigger reach than a town lamp — "a
// 30 foot radius around the castle" at this project's own ~2.5ft/tile
// convention (LIGHT_RADIUS_TILES(4) tiles = "about 10 foot radius," per
// the comment on that constant, i.e. ~2.5ft/tile), so 30ft ≈ 12 tiles.
export const CASTLE_LIGHT_RADIUS_TILES = 12;

// Beyond the core radius above, the light doesn't just cut off — it
// tapers smoothly over this many additional tiles (see
// staticLightRadiusAt) so walking away from the castle reads as fading
// into the dark, not stepping through an invisible wall. Widened further
// (a later follow-up ask: "the player should be able to see the light at
// a distance, right now if you step 1 small step outside the light
// radius then it goes completely dark") — a short taper meant the
// effective radius was already down near NO_LIGHT_RADIUS_TILES well
// before the player actually noticed they'd left the lit area, so the
// LAST step across that boundary read as a hard cliff into pitch black.
export const CASTLE_LIGHT_FALLOFF_TILES = 16;

// Fixed-position light sources ("like a lamp in town") — every tile
// within a source's own radiusTiles (LIGHT_RADIUS_TILES if unset) is lit
// regardless of time of day or who's standing there; a source can also
// give an optional falloffTiles for a soft edge (see staticLightRadiusAt)
// — town lamps default to 0 (a hard edge is fine at that small scale).
// Grimoak Grounds' entries ring the WHOLE castle (a follow-up fix — a
// single point anchored on the front door left the back and sides mostly
// or entirely outside even the falloff range, since the building itself
// is 60+ tiles wide) rather than just the front: the door, the back-
// center, both side-centers, and all 4 corners of MOAT_INNER (the
// building's own footprint plus its fixed buffer — see shared/maps.ts —
// a close, cheap stand-in for "the castle's actual edge" without needing
// real point-to-rectangle distance math). Each still gets the same much
// larger custom radius than a town lamp and the same gradual falloff —
// the whole building lights up the ground around it at night so players
// can navigate around any side of it, fading out rather than vanishing
// outright as they walk further away.
const CASTLE_LIGHT_SOURCE = { radiusTiles: CASTLE_LIGHT_RADIUS_TILES, falloffTiles: CASTLE_LIGHT_FALLOFF_TILES };
const CASTLE_LIGHT_MID_ROW = Math.round((MOAT_INNER_TOP + MOAT_INNER_BOTTOM) / 2);
export const STATIC_LIGHT_SOURCES: Partial<Record<MapName, Array<{ row: number; col: number; radiusTiles?: number; falloffTiles?: number }>>> = {
  Floro: [{ row: 25, col: 25 }],
  Kortho: [{ row: 25, col: 25 }],
  // Bramwick's own standing torches (a later follow-up ask: "provide
  // light within their own radius similar to the spell lucem for a
  // player") — bigger than a wand-lit player's own LUCEM_LIGHT_RADIUS_TILES
  // now ("expand the distance of the light radius") with a much longer
  // taper (same "no sudden cliff into pitch black" fix as the castle's
  // own CASTLE_LIGHT_FALLOFF_TILES above — 2 tiles was over almost as
  // soon as it started). No separate "only at night" flag needed here —
  // the dark-fog system that actually consults this (see WorldScene's
  // updateDarkFog) never darkens anything at all outside isDarkHour to
  // begin with, so these are already functionally night-only; only the
  // SPRITE's own lit/unlit frame (see standingTorchPositionsFor/
  // handleWorldTime) needs the explicit hour check.
  Bramwick: standingTorchPositionsFor('Bramwick').map((pos) => ({ ...pos, radiusTiles: LUCEM_LIGHT_RADIUS_TILES + 3, falloffTiles: 6 })),
  'Grimoak Grounds': [
    { row: CASTLE_DOOR_ON_GROUNDS.row, col: CASTLE_DOOR_ON_GROUNDS.col, ...CASTLE_LIGHT_SOURCE }, // front (the door)
    { row: MOAT_INNER_TOP, col: CASTLE_DOOR_ON_GROUNDS.col, ...CASTLE_LIGHT_SOURCE }, // back
    { row: CASTLE_LIGHT_MID_ROW, col: MOAT_INNER_LEFT, ...CASTLE_LIGHT_SOURCE }, // left side
    { row: CASTLE_LIGHT_MID_ROW, col: MOAT_INNER_RIGHT, ...CASTLE_LIGHT_SOURCE }, // right side
    { row: MOAT_INNER_TOP, col: MOAT_INNER_LEFT, ...CASTLE_LIGHT_SOURCE }, // corners
    { row: MOAT_INNER_TOP, col: MOAT_INNER_RIGHT, ...CASTLE_LIGHT_SOURCE },
    { row: MOAT_INNER_BOTTOM, col: MOAT_INNER_LEFT, ...CASTLE_LIGHT_SOURCE },
    { row: MOAT_INNER_BOTTOM, col: MOAT_INNER_RIGHT, ...CASTLE_LIGHT_SOURCE },
  ],
};

// Torch-lined halls, not just one lit stall — the WHOLE map is always
// visible regardless of time of day or what the player's carrying/knows
// (see main.ts's updateDarkFog/applyDaynightTint call sites). Every room
// inside Grimoak Castle is included (item 1) — the day/night system
// shouldn't apply indoors at all; "Grimoak Grounds" itself (outside) is
// deliberately NOT included, it still has a normal day/night cycle.
// Bramwick's own 4 shop interiors (a later follow-up ask: "it shouldn't
// be dark in the shops ever") join the castle's own torch-lit rooms —
// same always-lit treatment, not a separate mechanism. A later follow-up
// ask went further for Kortho specifically: "Kortho and the inside of all
// of the shops are always fully lit even at night because it's a well
// lit town" — unlike Bramwick, the TOWN STREET itself is included here
// too, not just its shop interiors. Floro gets the identical treatment
// (a further follow-up ask: "make sure... Floro get[s] the same updates
// that Kortho is getting").
export const ALWAYS_LIT_MAPS: MapName[] = [
  'Labyrinth',
  ...GRIMOAK_CASTLE_MAPS,
  ...BRAMWICK_SHOP_MAPS,
  'Kortho',
  ...KORTHO_SHOP_MAPS,
  'Floro',
  ...FLORO_SHOP_MAPS,
  // Gobbler Village's own huts (a later follow-up ask) — same "shop
  // interiors are always lit" treatment as Bramwick's own shops above;
  // the village SQUARE itself keeps a normal day/night cycle (see its own
  // standing torches instead), same as Bramwick's own street.
  ...GOBBLER_VILLAGE_HUT_MAPS,
];

export function isAlwaysLit(mapName: MapName): boolean {
  return ALWAYS_LIT_MAPS.includes(mapName);
}

// Purely decorative (unlike shared/trees.ts's tree positions, these never
// block movement) — evenly spaced along all four walls of an always-lit
// map, giving the visual reason it never goes dark. Client-only rendering
// (see src/wallTorchSprite.ts), but the position list still lives here so
// it's computed once from the map's own size rather than hand-placed.
const WALL_TORCH_SPACING = 6;

// No torch may sit ON or immediately NEXT TO a door/stairs tile (a later
// follow-up ask: "no torches touching any doors or stairs across the
// entire castle") — checked against whichever axis the torch and the
// exit actually share (same row -> compare columns, same col -> compare
// rows), so this only ever suppresses a torch genuinely sharing that
// exit's own wall, not an unrelated one elsewhere in the room.
function isTooCloseToAnExit(def: { exits: Array<{ row: number; col: number }> }, row: number, col: number): boolean {
  return def.exits.some((e) => (e.row === row && Math.abs(e.col - col) <= 1) || (e.col === col && Math.abs(e.row - row) <= 1));
}

export function torchWallPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (!isAlwaysLit(mapName)) return [];
  const def = getMap(mapName);
  // Floor 4's own torches (a later follow-up ask) — hand-placed instead
  // of the generic spacing loop below, since its 4 decorative portals
  // (see portalPositionsFor) need dedicated clearance the generic loop
  // can't account for (portals aren't MapExits, so the generic exit-
  // avoidance filter never sees them at all): the north/south walls'
  // own would-be center torch (the generic spacing's col 12, exactly
  // where both portals now sit) is split into two, nudged apart to
  // col 9/15; the east/west walls' own single torch (row 6, close to
  // the portals' own row FLOOR_LANDING_MID_ROW=8) moves further north
  // to row 3.
  if (mapName === 'Grimoak Castle 4th Floor') {
    const positions = [
      { row: 0, col: 9 },
      { row: 0, col: 15 },
      { row: FLOOR_LANDING_ROWS - 1, col: 9 },
      { row: FLOOR_LANDING_ROWS - 1, col: 15 },
      { row: 3, col: 0 },
      { row: 3, col: FLOOR_LANDING_COLS - 1 },
    ];
    return positions.filter(
      (p) => !isTooCloseToAnExit(def, p.row, p.col) && !portalPositionsFor(mapName).some((port) => port.row === p.row && port.col === p.col)
    );
  }
  // Bramwick's own 4 shop interiors (a later follow-up ask) — hand-placed
  // too, since they're far smaller (10x10, see shared/maps.ts's
  // SHOP_INTERIOR_SIZE) than the generic spacing loop below can handle at
  // all: WALL_TORCH_SPACING(6) needs a wall at least 2*6=12 tiles long to
  // ever place a single torch on it, so the loop would silently produce
  // zero torches here. One torch in each back corner instead, clear of
  // both the door (bottom-center) and the shopkeeper (top-center).
  if ((BRAMWICK_SHOP_MAPS as readonly string[]).includes(mapName)) {
    const positions = [
      { row: 2, col: 2 },
      { row: 2, col: def.cols - 3 },
      { row: def.rows - 3, col: 2 },
      { row: def.rows - 3, col: def.cols - 3 },
    ];
    return positions.filter((p) => !isTooCloseToAnExit(def, p.row, p.col));
  }
  const positions: Array<{ row: number; col: number }> = [];
  for (let col = WALL_TORCH_SPACING; col < def.cols - WALL_TORCH_SPACING; col += WALL_TORCH_SPACING) {
    positions.push({ row: 0, col });
    positions.push({ row: def.rows - 1, col });
  }
  for (let row = WALL_TORCH_SPACING; row < def.rows - WALL_TORCH_SPACING; row += WALL_TORCH_SPACING) {
    positions.push({ row, col: 0 });
    positions.push({ row, col: def.cols - 1 });
  }
  // Skip any tile that's ON or immediately next to a door/stairs — a
  // torch shouldn't crowd the one way in or out.
  return positions.filter((p) => !isTooCloseToAnExit(def, p.row, p.col));
}

// 4 fireplaces per castle room — 2 near the top wall and 2 near the
// bottom (a follow-up ask, doubling the original top-only pair) — offset
// from the room's own quarter/three-quarter columns rather than
// hand-placed, same "computed once from the map's own size" reasoning as
// the wall torches above. Skips an exit tile for the same reason. In the
// bigger rooms (Entrance Hall, Great Hall, house common rooms), the
// columns are nudged in toward the center a little further (a follow-up
// ask, "bring them in towards the center... away from doors") — the
// classrooms stay at the original 1/4-3/4 split since they're small
// enough already (see WorldScene's renderMap, which shrinks the
// fireplace SPRITE itself by half there instead).
export function fireplacePositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  // The secret room (a follow-up ask) is tiny and deliberately bare —
  // "a few torches on the walls" (already automatic, see
  // torchWallPositionsFor) and a treasure chest, no fireplaces cluttering
  // it up.
  if (mapName === 'Caverna Secretissima') return [];
  // The Dorms rooms (a later follow-up ask) are small bedrooms with just
  // 5 beds — no fireplaces to clutter them up, same bare-room treatment
  // as the secret room above.
  if ((DORM_MAPS as readonly string[]).includes(mapName)) return [];
  if (!(GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return [];
  const def = getMap(mapName);
  // The castle's 3 upper floors and their 10 specialization chambers (a
  // later follow-up ask: "only 2 fireplaces... in center middle") — a
  // tight side-by-side pair straddling the room's own center, instead of
  // the generic 4-corners layout below.
  if ((CASTLE_UPPER_FLOOR_MAPS as readonly string[]).includes(mapName) || (SPECIALIZATION_CHAMBER_MAPS as readonly string[]).includes(mapName)) {
    const midRow = Math.floor(def.rows / 2);
    const midCol = Math.floor(def.cols / 2);
    const offset = (SPECIALIZATION_CHAMBER_MAPS as readonly string[]).includes(mapName) ? 3 : 4;
    const positions = [
      { row: midRow, col: midCol - offset },
      { row: midRow, col: midCol + offset },
    ];
    return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
  }
  const isClassroom = (CLASSROOM_MAPS as readonly string[]).includes(mapName);
  const isCommonRoom = (COMMON_ROOM_MAPS as readonly string[]).includes(mapName);
  // The Entrance Hall specifically has 8 doors spread across its own
  // north wall (see shared/maps.ts's ENTRANCE_NORTH_DOORS) — even the
  // generic "large room" inset above still landed close to one of them
  // (a follow-up ask: "still too close to the doors"), so it gets its
  // own deeper inset AND columns deliberately picked to sit BETWEEN two
  // door columns rather than a fraction of the room's width. Common
  // rooms get the same deeper inset (a follow-up ask: "bring the
  // fireplaces in closer like the entrance hall... common rooms right
  // now should look very similar to entrance hall") but don't have the
  // Entrance Hall's own multi-door concern, so their columns stay a
  // (tighter-than-generic) fraction of the room's width instead of
  // hardcoded literals.
  const isEntranceHall = mapName === 'Grimoak Entrance Hall';
  const topRow = isEntranceHall || isCommonRoom ? 8 : 3;
  const bottomRow = isEntranceHall || isCommonRoom ? def.rows - 9 : def.rows - 4;
  // Classrooms moved from 0.25 to 0.1 (a follow-up ask) — at 0.25 a
  // classroom's fireplace column landed on the EXACT same column as its
  // right-side student desk (see studentDeskPositionsFor's rightCol),
  // stacking a fireplace and a desk on one tile. 0.1 sits both fireplaces
  // well clear of the desks at col 4/cols-5.
  const colFraction = isClassroom ? 0.1 : isCommonRoom ? 0.28 : 0.32;
  const cols = isEntranceHall ? [14, 38] : [Math.round(def.cols * colFraction), Math.round(def.cols * (1 - colFraction))];
  const positions = [
    { row: topRow, col: cols[0]! },
    { row: topRow, col: cols[1]! },
    { row: bottomRow, col: cols[0]! },
    { row: bottomRow, col: cols[1]! },
  ];
  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
}

// 4 student desks per classroom, 2 on either side (a follow-up ask) —
// fixed rows between the teacher's own desk/podium and the door, well
// clear of both (see server/worlds/teachers.ts's deskPositionFor for the
// teacher's own desk, and shared/spells.ts for the podium position).
// Classroom-only (CLASSROOM_MAPS), not the bigger rooms.
export function studentDeskPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (!(CLASSROOM_MAPS as readonly string[]).includes(mapName)) return [];
  const def = getMap(mapName);
  const leftCol = 4;
  const rightCol = def.cols - 5;
  const positions = [
    { row: 8, col: leftCol },
    { row: 8, col: rightCol },
    { row: 10, col: leftCol },
    { row: 10, col: rightCol },
  ];
  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
}

// A small square-formation cluster of 4 benches around the room's own
// center — a social gathering spot (a follow-up ask upgraded these from
// plain chairs to benches, spread a little further apart than before),
// Entrance-Hall-and-common-room-only (not classrooms, which already have
// their own student desks). Each bench's own `angle` (a Phaser rotation
// in degrees, clockwise) points its backrest AWAY from the center and its
// seat INWARD, toward the other three — "facing each other" — assuming
// the bench texture itself is drawn with its backrest on its own north
// edge by default (see tools/gen-bench.mjs). Offset far enough from the
// center that players can still stand and mingle between them, and clear
// of every fireplace position above (those sit much closer to the
// top/bottom walls, see topRow/bottomRow).
export function benchPositionsFor(mapName: MapName): Array<{ row: number; col: number; angle: number }> {
  const isEntranceHall = mapName === 'Grimoak Entrance Hall';
  const isCommonRoom = (COMMON_ROOM_MAPS as readonly string[]).includes(mapName);
  if (!isEntranceHall && !isCommonRoom) return [];
  const def = getMap(mapName);
  const midRow = Math.floor(def.rows / 2);
  const midCol = Math.floor(def.cols / 2);
  // A later follow-up ask brought the 4 benches in slightly closer
  // together (from 4) while still keeping them centered on the room.
  const offset = 3;
  const positions = [
    { row: midRow - offset, col: midCol, angle: 0 }, // north of center, faces south
    { row: midRow + offset, col: midCol, angle: 180 }, // south of center, faces north
    { row: midRow, col: midCol - offset, angle: 270 }, // west of center, faces east
    { row: midRow, col: midCol + offset, angle: 90 }, // east of center, faces west
  ];
  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
}

// A fireplace's own tile AND the tile directly above it (a follow-up
// correction — the flame sprite's art visually rises well above its
// anchor tile, see WorldScene's origin(0.5, 0.85), so blocking only the
// base tile let a player stand one tile north and appear to be standing
// inside the fire). A further follow-up ask widened this to the sides
// too ("collision... only at the bottom, you can walk through it from
// the top or the sides") — the fireplace art (80x88px, ~2.5x2.75 tiles
// at full scale) is wider than the single anchor column, so the block
// now covers a full 3-wide, 2-tall footprint (one tile either side of
// the anchor column, the anchor row and the one above it) rather than
// just a 1-wide strip. Both server collision checks (world-manager.
// service.ts, monster-manager.service.ts) should use this instead of
// checking fireplacePositionsFor directly.
export function isFireplaceBlocked(mapName: MapName, row: number, col: number): boolean {
  return fireplacePositionsFor(mapName).some((p) => (row === p.row || row === p.row - 1) && Math.abs(col - p.col) <= 1);
}

// A bench's own tile only — no oversized sprite art to account for the
// way a fireplace's flame does, so no extra tile above it needed.
export function isBenchBlocked(mapName: MapName, row: number, col: number): boolean {
  return benchPositionsFor(mapName).some((p) => p.row === row && p.col === col);
}

// Whether (row, col) is immediately next to one of the room's own
// benches (a follow-up ask: "if a player sits or rests on one of the
// benches... offer an extra 10% gain") — a bench's own tile always
// blocks movement (see isBenchBlocked above), so "sitting on" one
// necessarily means standing right next to it, same Chebyshev-distance-1
// adjacency isWithinRadius uses elsewhere for "close enough."
export function isNearBench(mapName: MapName, row: number, col: number): boolean {
  return benchPositionsFor(mapName).some((p) => Math.abs(row - p.row) <= 1 && Math.abs(col - p.col) <= 1);
}

// The Dorms rooms' own 5 beds (a later follow-up ask) — evenly spaced
// along one row, well clear of the room's own door (see
// dormsOffCommonRoom in shared/maps.ts).
export function bedPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (!(DORM_MAPS as readonly string[]).includes(mapName)) return [];
  const def = getMap(mapName);
  const row = Math.floor(def.rows / 2);
  const margin = 2;
  const usableCols = def.cols - margin * 2 - 1;
  const positions: Array<{ row: number; col: number }> = [];
  for (let i = 0; i < 5; i++) {
    const col = margin + Math.round((i * usableCols) / 4);
    positions.push({ row, col });
  }
  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
}

export function isBedBlocked(mapName: MapName, row: number, col: number): boolean {
  return bedPositionsFor(mapName).some((p) => p.row === row && p.col === col);
}

// The Great Hall's own long banquet table (a follow-up ask: "add a long
// wooden table sprite in the center of the Great Hall that stretches
// horizontally for about half of the room... wooden chairs on both
// sides") — Great-Hall-only. A fixed 2-tiles-deep footprint centered on
// the room's own mid row/col; width scales off the room's own column
// count (half of it) rather than a literal, so it still reads as
// "about half the room" if this room's size ever changes again.
function greatHallTableBounds(mapName: MapName): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
  if (mapName !== 'Great Hall') return null;
  const def = getMap(mapName);
  const midRow = Math.floor(def.rows / 2);
  const midCol = Math.floor(def.cols / 2);
  const widthTiles = Math.round(def.cols * 0.5);
  const colStart = midCol - Math.floor(widthTiles / 2);
  const colEnd = colStart + widthTiles - 1;
  return { rowStart: midRow - 1, rowEnd: midRow, colStart, colEnd };
}

export function greatHallTableFootprint(mapName: MapName): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
  return greatHallTableBounds(mapName);
}

// The faculty stage at the room's own east wall (a follow-up ask: "all
// the way to the very right of the Great Hall make a wooden stage") — a
// single rectangular platform, tall enough (in rows) to hold its own 7
// seats (see greatHallChairPositionsFor) with room to spare, narrow (in
// columns) since the seats sit in a single facing-west column near its
// own front edge.
function greatHallStageBounds(mapName: MapName): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
  if (mapName !== 'Great Hall') return null;
  const def = getMap(mapName);
  const midRow = Math.floor(def.rows / 2);
  const widthTiles = Math.round(def.cols * 0.18);
  const colEnd = def.cols - 3;
  const colStart = colEnd - widthTiles + 1;
  return { rowStart: midRow - 8, rowEnd: midRow + 8, colStart, colEnd };
}

export function greatHallStagePlatform(mapName: MapName): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
  return greatHallStageBounds(mapName);
}

// Every seat in the Great Hall: 6 dining chairs along each of the
// table's own long (north/south) sides, plus the faculty stage's own 7
// seats (3 north + 1 bigger head chair + 3 south, all facing west
// toward the table/room — a follow-up ask: "3 normal wooden chairs on
// one side of the stage facing the big table, 3 other... on the other
// side, and one bigger chair in the middle"). Each chair's own `angle`
// follows benchPositionsFor's same rotation convention (its top-down
// texture's backrest defaults to its own north edge; angle 0 faces
// south, 90 faces west, 180 faces north).
export function greatHallChairPositionsFor(mapName: MapName): Array<{ row: number; col: number; angle: number; big: boolean }> {
  const table = greatHallTableBounds(mapName);
  if (!table) return [];
  const def = getMap(mapName);
  const positions: Array<{ row: number; col: number; angle: number; big: boolean }> = [];

  // Dining chairs, 6 per side, evenly spaced with a margin from each end
  // of the table (same margin+distribute shape as bedPositionsFor's 5
  // beds).
  const margin = 2;
  const widthTiles = table.colEnd - table.colStart + 1;
  const usableCols = widthTiles - margin * 2 - 1;
  const seatCount = 6;
  for (let i = 0; i < seatCount; i++) {
    const col = table.colStart + margin + Math.round((i * usableCols) / (seatCount - 1));
    positions.push({ row: table.rowStart - 1, col, angle: 0, big: false }); // north side, faces south
    positions.push({ row: table.rowEnd + 1, col, angle: 180, big: false }); // south side, faces north
  }

  // The faculty stage's own 7 seats — a single column near its own front
  // (west) edge, all facing west toward the dining table.
  const stage = greatHallStageBounds(mapName);
  if (stage) {
    const chairCol = stage.colStart + 2;
    const seatOffsets = [-6, -4, -2, 0, 2, 4, 6];
    for (const offset of seatOffsets) {
      positions.push({ row: Math.floor(def.rows / 2) + offset, col: chairCol, angle: 90, big: offset === 0 });
    }
  }

  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
}

// "Collision for the table all around" — the table's whole rectangular
// footprint blocks movement (unlike a single-tile bench/chair), so
// players walk AROUND it rather than through it.
export function isGreatHallTableBlocked(mapName: MapName, row: number, col: number): boolean {
  const table = greatHallTableBounds(mapName);
  if (!table) return false;
  return row >= table.rowStart && row <= table.rowEnd && col >= table.colStart && col <= table.colEnd;
}

// Each chair (dining or stage) blocks only its own tile, same as a bench.
export function isGreatHallChairBlocked(mapName: MapName, row: number, col: number): boolean {
  return greatHallChairPositionsFor(mapName).some((p) => p.row === row && p.col === col);
}

export function isWithinRadius(row: number, col: number, sourceRow: number, sourceCol: number, radiusTiles: number): boolean {
  return Math.abs(row - sourceRow) <= radiusTiles && Math.abs(col - sourceCol) <= radiusTiles;
}

export function isWithinLightRadius(row: number, col: number, sourceRow: number, sourceCol: number): boolean {
  return isWithinRadius(row, col, sourceRow, sourceCol, LIGHT_RADIUS_TILES);
}

export function isWithinShopReach(row: number, col: number, sourceRow: number, sourceCol: number): boolean {
  return isWithinRadius(row, col, sourceRow, sourceCol, SHOP_REACH_TILES);
}

// Returns the EFFECTIVE radius (in tiles) of whichever nearby static
// source reaches this tile — the biggest one, if more than one does — or
// null if none do at all. Within a source's own radiusTiles, that's just
// the plain radius (a hard, fully-lit core); beyond it, if the source has
// a falloffTiles, the effective radius tapers linearly down to 0 over
// that extra distance rather than cutting off outright — walking away
// from the castle should read as the light fading behind you, not
// stepping through an invisible wall (a follow-up fix; town lamps keep
// falloffTiles unset, so they're unaffected). Callers that only care
// about a lit/unlit tile can just check for non-null (see
// isNearStaticLight); the client's dark-fog hole (see WorldScene's
// updateDarkFog) needs the actual number, both so the castle's much
// bigger CASTLE_LIGHT_RADIUS_TILES doesn't get clamped down to a town
// lamp's LIGHT_RADIUS_TILES, and so the taper itself is visible.
export function staticLightRadiusAt(mapName: MapName, row: number, col: number): number | null {
  const sources = STATIC_LIGHT_SOURCES[mapName];
  if (!sources) return null;
  let best: number | null = null;
  for (const s of sources) {
    const radius = s.radiusTiles ?? LIGHT_RADIUS_TILES;
    const falloff = s.falloffTiles ?? 0;
    const distance = Math.max(Math.abs(row - s.row), Math.abs(col - s.col));
    let effective: number | null = null;
    if (distance <= radius) effective = radius;
    else if (falloff > 0 && distance <= radius + falloff) effective = radius * (1 - (distance - radius) / falloff);
    if (effective !== null && (best === null || effective > best)) best = effective;
  }
  return best;
}

export function isNearStaticLight(mapName: MapName, row: number, col: number): boolean {
  return staticLightRadiusAt(mapName, row, col) !== null;
}

// A player can see SOMETHING in the dark if they have infravision
// (innate, goblin-only) or a torch in their shield/off-hand slot — but
// the two aren't equivalent (see hasFullVision below): infravision sees
// everywhere, a torch only lights a small radius around its carrier.
export function hasLightSource(skills: Record<string, number>, equipment: Record<string, string>): boolean {
  return skills[INFRAVISION_SKILL] !== undefined || equipment.shield === TORCH_ITEM;
}

// Infravision sees clearly across the WHOLE map, dark hours or not — no
// local radius, unlike a torch. Strictly better than carrying a torch.
export function hasFullVision(skills: Record<string, number>): boolean {
  return skills[INFRAVISION_SKILL] !== undefined;
}

// Whether this player EMITS light a nearby ally could benefit from — a
// carried torch only. Infravision is personal (heat) vision, not light
// emitted into the world, so it doesn't help anyone standing next to you
// see any better.
export function emitsLight(equipment: Record<string, string>): boolean {
  return equipment.shield === TORCH_ITEM;
}

// The castle's 4th floor — 4 "swirling light blue" portals, one per wall
// (a later follow-up ask), positioned clear of the floor's own real
// down-stairs (see shared/maps.ts's floorLandingDefinition — the
// down-stairs sits at col FLOOR_LANDING_DOWN_STAIRS_COL, this file
// doesn't need that one). Each one IS a real MapExit now (a later
// follow-up ask: "add some places the portals will take the player" —
// see maps.ts's own FLOOR4_LANDING.exits/portalDungeonDefinition), so a
// player has to be able to stand ON this exact tile to trigger it (see
// isPortalBlocked's own doc comment for why player movement no longer
// treats it as solid) — only a monster still can't use one (see
// MonsterManagerService.isFree).
export function portalPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (mapName === 'Grimoak Castle 4th Floor') {
    const midCol = Math.floor(FLOOR_LANDING_COLS / 2);
    return [
      { row: 0, col: midCol }, // north wall
      // A later follow-up ask moved this off the (unused) up-stairs slot
      // and onto the wall's own center, clear of the real down-stairs
      // (FLOOR_LANDING_DOWN_STAIRS_COL) — see torchWallPositionsFor's own
      // floor-4-specific torch layout, nudged apart to make room for both
      // this and the north portal sharing the same center column.
      { row: FLOOR_LANDING_ROWS - 1, col: midCol }, // south wall
      { row: FLOOR_LANDING_MID_ROW, col: FLOOR_LANDING_COLS - 1 }, // east wall
      { row: FLOOR_LANDING_MID_ROW, col: 0 }, // west wall
    ];
  }
  // A later follow-up ask: "there is no exit portal in the worlds you
  // created that the portals take you to. Fix this so that way the
  // player can get back" — each of the 4 dungeon maps gets its own
  // single return portal, rendered exactly on top of its own south-edge
  // MapExit tile (see shared/maps.ts's portalDungeonDefinition), same
  // "decorative swirl over an ordinary edge exit" shape the 4th floor's
  // own 4 portals already use.
  if ((PORTAL_DUNGEON_MAPS as readonly string[]).includes(mapName)) {
    return [{ row: PORTAL_DUNGEON_SIZE_ROWS - 1, col: PORTAL_DUNGEON_MID_COL }];
  }
  return [];
}

// Still used by MonsterManagerService.isFree (monsters never use a
// portal) — a still-later follow-up ask removed the equivalent check from
// WorldManagerService's own player-movement isOccupied, since blocking
// this exact tile made every portal's real exit (see this function's own
// doc comment above) permanently unreachable for a player.
export function isPortalBlocked(mapName: MapName, row: number, col: number): boolean {
  return portalPositionsFor(mapName).some((p) => p.row === row && p.col === col);
}

// Bramwick's own 9 freestanding street torches (a later follow-up ask) —
// 3 clusters of 3 (left/middle/right) down the village, clear of every
// shop cottage's own footprint (each centered on its door column, see
// BRAMWICK_SHOP_DOORS — cols 10/30 — this file doesn't import that
// private constant, hence the plain literals here instead) and the
// entrance road/sign. Purely decorative positions for the CLIENT's own
// unlit/lit sprite swap (see WorldScene's handleWorldTime) — see
// STATIC_LIGHT_SOURCES below for the matching light-radius entries that
// actually push back the dark-fog at night.
export function standingTorchPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (mapName === 'Gobbler Village') return gobblerVillageTorchPositions();
  if (mapName !== 'Bramwick') return [];
  // A later follow-up ask reworked the original 3x3 grid into a
  // rectangle "encompassing the town": a left wall (col 5) and a right
  // wall (col 35), each running the town's full height, plus 3 interior
  // fixes (the two entrance-flanking torches and one clearing the Pet
  // Shop's own roof). A follow-up bug fix ("the torches on the left and
  // right are still not aligned vertically, some are offset") caught
  // that the wall's own TOP/BOTTOM rows used to be separate "corner"
  // torches at col 3/37 — 2 tiles OUTSIDE the col 5/35 the 3 middle rows
  // actually used, so the "wall" visibly kinked in and back out at each
  // end instead of running perfectly straight. Every wall torch now
  // shares the exact same column top to bottom.
  const wallRows = [9, 14, 20, 26, 31];
  const wallCols = [5, 35];
  const bottomRow = 31;
  return [
    ...wallCols.flatMap((col) => wallRows.map((row) => ({ row, col }))),
    // The top edge's own middle torch — clear of both FRONT shops' own
    // ~7-13/27-33 column footprints AND the Pet Shop's own ~17-22 roof
    // span (its door sits at (10, BRAMWICK_MID_COL), roofline reaching to
    // roughly row 2.5) — see WorldScene's cottageSprites.
    { row: 9, col: 16 },
    // A follow-up bug fix: "move the torch that is right in front of the
    // door to the left and add one on the right, so the player doesn't
    // need to move around it after entering Bramwick" — the south
    // entrance's own band (see bramwickGroundsEntranceExits) is 5 columns
    // wide, centered on BRAMWICK_MID_COL; the single torch that used to
    // sit dead center stood directly in a player's path walking straight
    // in. Two torches flanking that band instead — the entire entrance
    // stays clear.
    { row: bottomRow, col: BRAMWICK_MID_COL - 3 },
    { row: bottomRow, col: BRAMWICK_MID_COL + 3 },
  ];
}

// Gobbler Village (a later follow-up ask: "torches that light it up at
// night") — same day/night-cycling standing torch, same "rectangle
// perimeter" idea as Bramwick's own wall above. All 3 huts (see
// shared/maps.ts's GOBBLER_HUT_DOORS) sit well clear of the perimeter
// itself, so — unlike Bramwick — no special-case clearance is needed.
function gobblerVillageTorchPositions(): Array<{ row: number; col: number }> {
  const wallRows = [9, 14, 20, 26, 31];
  const wallCols = [5, 35];
  return wallCols.flatMap((col) => wallRows.map((row) => ({ row, col })));
}

// A later follow-up ask: "the torches should have collision, so the
// players have to go around them" — same "solid decorative fixture"
// treatment isFireplaceBlocked/isBramwickSignBlocked already give every
// other standing prop, wired into the same occupancy checks (see
// WorldManagerService.isOccupied/MonsterManagerService's own isFree).
export function isStandingTorchBlocked(mapName: MapName, row: number, col: number): boolean {
  return standingTorchPositionsFor(mapName).some((p) => p.row === row && p.col === col);
}

// Two clickable name signs, one per side of Bramwick's own dirt-road
// entrance (a later follow-up ask: "the sign for Bramwick should be in
// Grimoak Grounds... update the sign in Bramwick to say Grimoak
// Grounds") — each sign names the destination the road leads TO, not
// wherever the player is currently standing, same as a real road sign.
// Both sit a couple tiles in from their own map's edge of the shared
// entrance, off to the side so neither blocks the road tile itself.
export const BRAMWICK_SIGN_POSITION = { row: BRAMWICK_ENTRANCE_ROW - 2, col: BRAMWICK_MID_COL + 4 };
export const GRIMOAK_GROUNDS_SIGN_POSITION = { row: 2, col: CASTLE_DOOR_ON_GROUNDS.col + 4 };

// Same pair-of-signs convention for the new NE "Road to Kortho" exit (a
// later follow-up ask) — one sign on each side of the shared entrance,
// each naming the destination the road leads TO. Offset to the side
// (row, since this road runs east-west) so neither sits on the road tile
// itself, same "a couple tiles in from the edge, off to the side" shape
// as the Bramwick pair above.
export const GRIMOAK_GROUNDS_ROAD_TO_KORTHO_SIGN_POSITION = {
  row: GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW + 4,
  col: GRIMOAK_GROUNDS_COLS - 3,
};
export const ROAD_TO_KORTHO_SIGN_POSITION = { row: ROAD_TO_KORTHO_MID_ROW + 4, col: ROAD_TO_KORTHO_COLS - 3 };
// A later follow-up ask: "put a sign going from Road to Kortho to
// Grimoak Grounds that says 'Grimoak Grounds'" — Road to Kortho's own
// WEST end had no sign of its own at all before this (only Grimoak
// Grounds' side of that same junction did); mirrors ROAD_TO_KORTHO_SIGN_
// POSITION's own offset, just near the opposite edge.
export const ROAD_TO_KORTHO_GRIMOAK_SIGN_POSITION = { row: ROAD_TO_KORTHO_MID_ROW + 4, col: 2 };

// Same pair-of-signs convention for the new SW "Road to Floro" exit (a
// later follow-up ask), transposed for a north-south road — the
// perpendicular offset is now COLUMN (not row) and "inward" is decreasing
// row from the map's own new south edge.
export const GRIMOAK_GROUNDS_ROAD_TO_FLORO_SIGN_POSITION = {
  row: GRIMOAK_GROUNDS_ROWS - 4,
  col: GRIMOAK_GROUNDS_ROAD_TO_FLORO_COL + 4,
};
export const ROAD_TO_FLORO_SIGN_POSITION = { row: ROAD_TO_FLORO_ROWS - 3, col: ROAD_TO_FLORO_MID_COL + 4 };
// Same missing-sign fix as Road to Kortho above (a later follow-up ask:
// "same thing, put a sign from Road to Floro to Grimoak Grounds") — Road
// to Floro's own NORTH end, mirroring ROAD_TO_FLORO_SIGN_POSITION's own
// offset near the opposite edge.
export const ROAD_TO_FLORO_GRIMOAK_SIGN_POSITION = { row: 2, col: ROAD_TO_FLORO_MID_COL + 4 };

// A later follow-up ask: "in kortho update the exit to Road to Kortho to
// have a dirt road leading out with a sign 'Road to Kortho'" — a third
// sign, this one sitting just inside the TOWN itself pointing back out,
// unlike the two pairs above which both sit on the connecting road's own
// two ends.
export const KORTHO_ROAD_SIGN_POSITION = { row: TOWN_MID_ROW + 4, col: 3 };
// Same treatment for Floro (a later follow-up ask: "make sure... Floro
// get[s] the same updates that Kortho is getting").
export const FLORO_ROAD_SIGN_POSITION = { row: 3, col: TOWN_MID_COL + 4 };

// A later follow-up ask: "make a connection to the new area Mystical
// Timberland... have a sign to Mystical Timberland" — same two-sided
// sign-pair convention as every other connection above, one on Grimoak
// Grounds' own side, one just inside Mystical Timberland pointing back.
// A follow-up bug fix: "the sign leading to mystical timberland should
// be on the grass or dirt road, right now it is on the water" — col 3 IS
// MOAT_OUTER_LEFT (the moat's own outer edge, still water at any row
// within its span) — moved to col 1, safely inside the narrow 3-tile-wide
// clear strip west of the moat.
export const GRIMOAK_GROUNDS_MYSTICAL_TIMBERLAND_SIGN_POSITION = { row: GRIMOAK_GROUNDS_MOAT_MID_ROW + 4, col: 1 };
export const MYSTICAL_TIMBERLAND_SIGN_POSITION = { row: MYSTICAL_TIMBERLAND_MID_ROW + 4, col: MYSTICAL_TIMBERLAND_COLS - 3 };

// A later follow-up ask: "there should be a dirt road and sign leading
// into 'Gobbler Village' from Grimoak Grounds and a dirt road and sign
// leading out of Gobbler Village into 'Grimoak Grounds'" — same
// two-sided sign-pair convention as every other connection above.
export const GRIMOAK_GROUNDS_GOBBLER_VILLAGE_SIGN_POSITION = { row: GRIMOAK_GROUNDS_GOBBLER_VILLAGE_ROW + 4, col: GRIMOAK_GROUNDS_COLS - 3 };
export const GOBBLER_VILLAGE_SIGN_POSITION = { row: GOBBLER_VILLAGE_MID + 4, col: 3 };

// A later follow-up ask: "add a sign on the Kortho side of the beach
// with 'The Shimmering Sea'" — sits on the near sand strip, off to the
// side of the town's own mid-row so it doesn't block the dock itself.
export const KORTHO_SHIMMERING_SEA_SIGN_POSITION = { row: TOWN_MID_ROW - 5, col: KORTHO_NEAR_SAND_COL_START + 1 };

// A later follow-up ask: "add a connection to the west of Floro... a
// sign with 'The Great Plains'... [Great Plains] have a dirt road
// connection at the top right/north east with sign 'Floro'" — same
// two-sided sign-pair convention as every other connection above, offset
// off the road band itself (which spans ±GREAT_PLAINS_FLORO_HALF_WIDTH_TILES
// rows on both sides) so neither sign sits on the road tiles.
export const FLORO_GREAT_PLAINS_SIGN_POSITION = { row: FLORO_GREAT_PLAINS_ROW - 4, col: 3 };
export const GREAT_PLAINS_FLORO_SIGN_POSITION = { row: GREAT_PLAINS_FLORO_ROW - 4, col: GREAT_PLAINS_SIZE - 3 };

// A later follow-up ask: "create a cave entrance at the northwest/north
// of the great plains... a sign next to it with 'Hexstone Cavern'...
// [Hexstone Cavern] a cave entrance/exit sprite with a sign next to it
// 'The Great Plains'" — same two-sided sign-pair convention as every
// other connection above, offset off the road band (which spans
// ±GREAT_PLAINS_HEXSTONE_HALF_WIDTH_TILES) so neither sign sits on the
// cave-entrance tiles themselves.
export const GREAT_PLAINS_HEXSTONE_SIGN_POSITION = { row: GREAT_PLAINS_HEXSTONE_ROW + 4, col: 3 };
export const HEXSTONE_GREAT_PLAINS_SIGN_POSITION = { row: HEXSTONE_CAVERN_SIZE - 4, col: HEXSTONE_GREAT_PLAINS_COL + 4 };

export function isBramwickSignBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName === 'Bramwick') return row === BRAMWICK_SIGN_POSITION.row && col === BRAMWICK_SIGN_POSITION.col;
  if (mapName === 'Grimoak Grounds') {
    return (
      (row === GRIMOAK_GROUNDS_SIGN_POSITION.row && col === GRIMOAK_GROUNDS_SIGN_POSITION.col) ||
      (row === GRIMOAK_GROUNDS_ROAD_TO_KORTHO_SIGN_POSITION.row && col === GRIMOAK_GROUNDS_ROAD_TO_KORTHO_SIGN_POSITION.col) ||
      (row === GRIMOAK_GROUNDS_ROAD_TO_FLORO_SIGN_POSITION.row && col === GRIMOAK_GROUNDS_ROAD_TO_FLORO_SIGN_POSITION.col) ||
      (row === GRIMOAK_GROUNDS_MYSTICAL_TIMBERLAND_SIGN_POSITION.row && col === GRIMOAK_GROUNDS_MYSTICAL_TIMBERLAND_SIGN_POSITION.col) ||
      (row === GRIMOAK_GROUNDS_GOBBLER_VILLAGE_SIGN_POSITION.row && col === GRIMOAK_GROUNDS_GOBBLER_VILLAGE_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Gobbler Village') {
    return row === GOBBLER_VILLAGE_SIGN_POSITION.row && col === GOBBLER_VILLAGE_SIGN_POSITION.col;
  }
  if (mapName === 'Road to Kortho') {
    return (
      (row === ROAD_TO_KORTHO_SIGN_POSITION.row && col === ROAD_TO_KORTHO_SIGN_POSITION.col) ||
      (row === ROAD_TO_KORTHO_GRIMOAK_SIGN_POSITION.row && col === ROAD_TO_KORTHO_GRIMOAK_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Road to Floro') {
    return (
      (row === ROAD_TO_FLORO_SIGN_POSITION.row && col === ROAD_TO_FLORO_SIGN_POSITION.col) ||
      (row === ROAD_TO_FLORO_GRIMOAK_SIGN_POSITION.row && col === ROAD_TO_FLORO_GRIMOAK_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Kortho') {
    return (
      (row === KORTHO_ROAD_SIGN_POSITION.row && col === KORTHO_ROAD_SIGN_POSITION.col) ||
      (row === KORTHO_SHIMMERING_SEA_SIGN_POSITION.row && col === KORTHO_SHIMMERING_SEA_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Floro') {
    return (
      (row === FLORO_ROAD_SIGN_POSITION.row && col === FLORO_ROAD_SIGN_POSITION.col) ||
      (row === FLORO_GREAT_PLAINS_SIGN_POSITION.row && col === FLORO_GREAT_PLAINS_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Mystical Timberland') {
    return row === MYSTICAL_TIMBERLAND_SIGN_POSITION.row && col === MYSTICAL_TIMBERLAND_SIGN_POSITION.col;
  }
  if (mapName === 'Great Plains') {
    return (
      (row === GREAT_PLAINS_FLORO_SIGN_POSITION.row && col === GREAT_PLAINS_FLORO_SIGN_POSITION.col) ||
      (row === GREAT_PLAINS_HEXSTONE_SIGN_POSITION.row && col === GREAT_PLAINS_HEXSTONE_SIGN_POSITION.col)
    );
  }
  if (mapName === 'Hexstone Cavern') {
    return row === HEXSTONE_GREAT_PLAINS_SIGN_POSITION.row && col === HEXSTONE_GREAT_PLAINS_SIGN_POSITION.col;
  }
  return false;
}
