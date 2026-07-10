// The five races selectable at registration — matches the text game's
// own RACES list, each with its own spritesheet (see characterSprites.ts
// for the race->texture-key mapping; 'dragonborn' reuses the
// dragon-man-spritesheet.png asset).
export const RACES = ['goblin', 'skeleton', 'zombie', 'dragonborn', 'slime'] as const;
// Reached only by evolving (see game.gateway.ts's maybeEvolveToHobgoblin)
// — never selectable at registration, same one-way/one-time convention
// as the text game's own EVOLVED_RACES.
export const EVOLVED_RACES = ['hobgoblin'] as const;
export type Race = (typeof RACES)[number] | (typeof EVOLVED_RACES)[number];

// Floro's 7 shop interiors (item 13, phase 1) — each a real separate map
// ("worlds of their own"), entered through a door on Floro's own street
// (see shared/maps.ts), but still considered PART of Floro town: the
// map/Where tab shows a player inside one of these as "<name> -
// <Building>" rather than the raw map name (see buildingLabelFor below),
// and they don't re-trigger the town-entry weapon gate (see TOWN_MAPS)
// since you already passed it to reach the street outside.
export const FLORO_SHOP_MAPS = [
  'Floro Blacksmith',
  'Floro General Store',
  'Floro Inn',
  'Floro Bank',
  'Floro Armorer',
  'Floro Pet Salesman',
  'Floro Jobs Office',
] as const;

export const MAP_NAMES = ['Great Plains', 'Labyrinth', 'Floro', 'Kortho', ...FLORO_SHOP_MAPS] as const;
export type MapName = (typeof MAP_NAMES)[number];

export const STARTING_MAP: MapName = 'Great Plains';

// Floro and Kortho are rival towns off the Great Plains's west/east
// edges — entry is gated (see game.gateway.ts's canEnterTown), same idea
// as the text game's own town-guard gate, simplified down to this
// project's single equipment slot: you need a weapon equipped to pass.
// Deliberately NOT extended to FLORO_SHOP_MAPS — stepping from the
// street into a shop doesn't re-gate you, you're already inside the town.
export const TOWN_MAPS: MapName[] = ['Floro', 'Kortho'];

// The short building suffix for the map modal's Where tab (item 13) —
// "<username> - Blacksmith" for someone inside a shop, vs. just
// "<username>" for someone standing on the street itself (null here).
export function whereLabelFor(mapName: MapName): string | null {
  const prefix = 'Floro ';
  return mapName.startsWith(prefix) && (FLORO_SHOP_MAPS as readonly string[]).includes(mapName) ? mapName.slice(prefix.length) : null;
}

// Which "town" a map belongs to, for grouping purposes — Floro's street
// AND all 7 of its shop interiors count as the same place (item 13: a
// player inside the Blacksmith should still show up in another Floro
// visitor's own Where tab, not just people on the exact same map value).
// Everywhere else is its own town of one.
export function townGroupFor(mapName: MapName): MapName {
  return mapName === 'Floro' || (FLORO_SHOP_MAPS as readonly string[]).includes(mapName) ? 'Floro' : mapName;
}

export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Wild monsters — deliberately named "wild goblin"/"wild skeleton" (not
// bare "goblin"/"skeleton") so they're never confused with the
// player-choosable races above, same disambiguation the text game's own
// monster kinds use.
export const MONSTER_KINDS = ['wild goblin', 'wild skeleton'] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];

// Same idea as the text game's own monster classification — determines
// which resistance skill (lesser normal/undead monster resistance)
// reduces a monster's counter-attack damage against the player who hit it.
export type MonsterClass = 'normal' | 'undead';
