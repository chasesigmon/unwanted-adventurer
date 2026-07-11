// The original 5 fantasy races each have their own spritesheet (see
// characterSprites.ts for the race->texture-key mapping; 'dragonborn'
// reuses the dragon-man-spritesheet.png asset).
// 'human' is the wizarding-school pivot's only playable race — a
// character creation screen no longer asks for a race at all (see
// characterSelect.ts), it's implied and always 'human'; customization
// instead comes from gender/hairColor/skinTone (see GENDERS/HAIR_COLORS/
// SKIN_TONES below). The original 5 fantasy races are kept, not deleted —
// this is a pivot in what NEW characters are, not a rewrite of the
// existing goblin-game mechanics those races still drive.
export const RACES = ['goblin', 'skeleton', 'zombie', 'dragonborn', 'slime', 'human'] as const;
// Reached only by evolving (see game.gateway.ts's maybeEvolveToHobgoblin)
// — never selectable at registration, same one-way/one-time convention
// as the text game's own EVOLVED_RACES.
export const EVOLVED_RACES = ['hobgoblin'] as const;
export type Race = (typeof RACES)[number] | (typeof EVOLVED_RACES)[number];

// Human customization (item 4) — chosen at character-creation instead of
// a race dropdown. Combined with gender, drives which of the 2 base
// spritesheets (male/female) is used and which 2 independently-tintable
// overlays (skin, hair) are applied over it — see characterSprites.ts.
export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];
export const HAIR_COLORS = ['brown', 'blonde', 'black'] as const;
export type HairColor = (typeof HAIR_COLORS)[number];
export const SKIN_TONES = ['white', 'tan', 'dark'] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

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

// Grimoak Academy — the wizarding-school pivot (original names throughout,
// no trademarked terms). "Grimoak Grounds" is the outer world (castle
// exterior, courtyard, lake, pitch, forest edge); everything else here is
// a real interior room inside the castle, same reciprocal-exit pattern as
// Floro's shops. See docs/research (or the published world sketch) for
// the full room directory — this phase-1 set is the hub-and-spoke
// skeleton: Entrance Hall out to the Grounds, the Great Hall, Thistledown
// (ground floor), and the dungeon stair; the Grand Staircase up to the
// two tower houses (Emberclaw, Starfall) and the first floor classroom
// corridor; the dungeon corridor down to Alchemy and Duskwing.
export const GRIMOAK_CASTLE_MAPS = [
  'Grimoak Entrance Hall',
  'Great Hall',
  'Grand Staircase',
  'First Floor Corridor',
  'Dungeon Corridor',
  'Elemental Casting',
  'Shapecraft',
  'Alchemy',
  'Emberclaw Common Room',
  'Duskwing Common Room',
  'Thistledown Common Room',
  'Starfall Common Room',
  // A staircase up from the Grand Staircase (item 6) — a stub for now,
  // the actual second-floor classrooms are "eventually" work.
  'Second Floor Corridor',
] as const;

export const MAP_NAMES = [
  'Great Plains',
  'Labyrinth',
  'Floro',
  'Kortho',
  ...FLORO_SHOP_MAPS,
  'Grimoak Grounds',
  ...GRIMOAK_CASTLE_MAPS,
] as const;
export type MapName = (typeof MAP_NAMES)[number];

// New characters now start just outside Grimoak Castle's front doors
// instead of the old goblin-game's Great Plains (a returning player still
// resumes exactly where they left off — see game.gateway.ts's
// handleConnection, which only falls back to STARTING_MAP for a brand
// new character).
export const STARTING_MAP: MapName = 'Grimoak Grounds';

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
  if (mapName.startsWith(prefix) && (FLORO_SHOP_MAPS as readonly string[]).includes(mapName)) return mapName.slice(prefix.length);
  // The castle's own rooms already read fine as their own names ("Great
  // Hall", "Alchemy", ...) without a building-suffix convention the way
  // Floro's shops needed one — but the Grounds itself should show as
  // plain (no suffix), matching a shop-street's own "no suffix" case.
  if ((GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return mapName;
  return null;
}

// Which "town" a map belongs to, for grouping purposes — Floro's street
// AND all 7 of its shop interiors count as the same place (item 13: a
// player inside the Blacksmith should still show up in another Floro
// visitor's own Where tab, not just people on the exact same map value).
// Everywhere else is its own town of one.
export function townGroupFor(mapName: MapName): MapName {
  if (mapName === 'Floro' || (FLORO_SHOP_MAPS as readonly string[]).includes(mapName)) return 'Floro';
  // Same idea for the castle — someone in the Great Hall or Emberclaw's
  // common room still shows up in the Where tab for a player standing
  // out on the Grounds.
  if (mapName === 'Grimoak Grounds' || (GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return 'Grimoak Grounds';
  return mapName;
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
