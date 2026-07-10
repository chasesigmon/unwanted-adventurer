import type { MapName } from './constants.js';
import { INFRAVISION_SKILL } from './skills.js';
import { getMap } from './maps.js';

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

// The broader cosmetic day/night split (matches the day/night overlay's
// own 18:00-6:00 tinted range) — used for the /time command's "day" or
// "night" label, a wider window than the hard-dark hours above.
export const NIGHT_START_HOUR = 18;
export const NIGHT_END_HOUR = 6;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

// Originally "about a 10 foot diameter," doubled per request — a player's
// own light (or a nearby ally's, or a static fixture below) reaches this
// many tiles in every direction. Deliberately NOT reused for shop reach
// (see SHOP_REACH_TILES) — those are unrelated distances that happened to
// share a number before, not the same concept.
export const LIGHT_RADIUS_TILES = 4;

// How close a player needs to be to a vendor to open/use its shop — its
// own constant so widening the light radius above doesn't also widen how
// far away you can shop from.
export const SHOP_REACH_TILES = 2;

export const TORCH_ITEM = 'torch';

// Fixed-position light sources ("like a lamp in town") — every tile
// within LIGHT_RADIUS_TILES of one of these is lit regardless of time of
// day or who's standing there.
export const STATIC_LIGHT_SOURCES: Partial<Record<MapName, Array<{ row: number; col: number }>>> = {
  Floro: [{ row: 25, col: 25 }],
  Kortho: [{ row: 25, col: 25 }],
};

// Torch-lined halls, not just one lit stall — the WHOLE map is always
// visible regardless of time of day or what the player's carrying/knows
// (see main.ts's updateDarkFog/applyDaynightTint call sites).
export const ALWAYS_LIT_MAPS: MapName[] = ['Labyrinth'];

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

export function isWithinRadius(row: number, col: number, sourceRow: number, sourceCol: number, radiusTiles: number): boolean {
  return Math.abs(row - sourceRow) <= radiusTiles && Math.abs(col - sourceCol) <= radiusTiles;
}

export function isWithinLightRadius(row: number, col: number, sourceRow: number, sourceCol: number): boolean {
  return isWithinRadius(row, col, sourceRow, sourceCol, LIGHT_RADIUS_TILES);
}

export function isWithinShopReach(row: number, col: number, sourceRow: number, sourceCol: number): boolean {
  return isWithinRadius(row, col, sourceRow, sourceCol, SHOP_REACH_TILES);
}

export function isNearStaticLight(mapName: MapName, row: number, col: number): boolean {
  const sources = STATIC_LIGHT_SOURCES[mapName];
  if (!sources) return false;
  return sources.some((s) => isWithinLightRadius(row, col, s.row, s.col));
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
