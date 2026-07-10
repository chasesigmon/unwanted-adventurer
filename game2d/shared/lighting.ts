import type { MapName } from './constants.js';
import { INFRAVISION_SKILL } from './skills.js';

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

// "About a 10 foot diameter" — a player's own light (or a nearby ally's,
// or a static fixture below) reaches this many tiles in every direction.
export const LIGHT_RADIUS_TILES = 2;

export const TORCH_ITEM = 'torch';

// Fixed-position light sources ("like a lamp in town") — every tile
// within LIGHT_RADIUS_TILES of one of these is lit regardless of time of
// day or who's standing there.
export const STATIC_LIGHT_SOURCES: Partial<Record<MapName, Array<{ row: number; col: number }>>> = {
  Floro: [{ row: 25, col: 25 }],
  Kortho: [{ row: 25, col: 25 }],
  Labyrinth: [{ row: 5, col: 5 }], // the shopkeeper's stall (see worlds/npcs.ts)
};

export function isWithinLightRadius(row: number, col: number, sourceRow: number, sourceCol: number): boolean {
  return Math.abs(row - sourceRow) <= LIGHT_RADIUS_TILES && Math.abs(col - sourceCol) <= LIGHT_RADIUS_TILES;
}

export function isNearStaticLight(mapName: MapName, row: number, col: number): boolean {
  const sources = STATIC_LIGHT_SOURCES[mapName];
  if (!sources) return false;
  return sources.some((s) => isWithinLightRadius(row, col, s.row, s.col));
}

// A player provides their own light if they have infravision (innate,
// goblin-only) or a torch in their shield/off-hand slot.
export function hasLightSource(skills: Record<string, number>, equipment: Record<string, string>): boolean {
  return skills[INFRAVISION_SKILL] !== undefined || equipment.shield === TORCH_ITEM;
}
