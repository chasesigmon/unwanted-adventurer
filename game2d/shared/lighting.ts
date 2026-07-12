import type { MapName } from './constants.js';
import { GRIMOAK_CASTLE_MAPS, CLASSROOM_MAPS, COMMON_ROOM_MAPS, DORM_MAPS } from './constants.js';
import { INFRAVISION_SKILL } from './skills.js';
import { getMap, CASTLE_DOOR_ON_GROUNDS, MOAT_INNER_LEFT, MOAT_INNER_RIGHT, MOAT_INNER_TOP, MOAT_INNER_BOTTOM } from './maps.js';

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

export const TORCH_ITEM = 'torch';

// A castle-sized fixture needs a much bigger reach than a town lamp — "a
// 30 foot radius around the castle" at this project's own ~2.5ft/tile
// convention (LIGHT_RADIUS_TILES(4) tiles = "about 10 foot radius," per
// the comment on that constant, i.e. ~2.5ft/tile), so 30ft ≈ 12 tiles.
export const CASTLE_LIGHT_RADIUS_TILES = 12;

// Beyond the core radius above, the light doesn't just cut off — it
// tapers smoothly over this many additional tiles (see
// staticLightRadiusAt) so walking away from the castle reads as fading
// into the dark, not stepping through an invisible wall.
export const CASTLE_LIGHT_FALLOFF_TILES = 10;

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
export const ALWAYS_LIT_MAPS: MapName[] = ['Labyrinth', ...GRIMOAK_CASTLE_MAPS];

export function isAlwaysLit(mapName: MapName): boolean {
  return ALWAYS_LIT_MAPS.includes(mapName);
}

// Purely decorative (unlike shared/trees.ts's tree positions, these never
// block movement) — evenly spaced along all four walls of an always-lit
// map, giving the visual reason it never goes dark. Client-only rendering
// (see src/wallTorchSprite.ts), but the position list still lives here so
// it's computed once from the map's own size rather than hand-placed.
const WALL_TORCH_SPACING = 6;

export function torchWallPositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (!isAlwaysLit(mapName)) return [];
  const def = getMap(mapName);
  const positions: Array<{ row: number; col: number }> = [];
  for (let col = WALL_TORCH_SPACING; col < def.cols - WALL_TORCH_SPACING; col += WALL_TORCH_SPACING) {
    positions.push({ row: 0, col });
    positions.push({ row: def.rows - 1, col });
  }
  for (let row = WALL_TORCH_SPACING; row < def.rows - WALL_TORCH_SPACING; row += WALL_TORCH_SPACING) {
    positions.push({ row, col: 0 });
    positions.push({ row, col: def.cols - 1 });
  }
  // Skip any tile that's actually a door/exit — a torch shouldn't sit on
  // top of the one way in or out.
  return positions.filter((p) => !def.exits.some((e) => e.row === p.row && e.col === p.col));
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
  const offset = 4;
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
