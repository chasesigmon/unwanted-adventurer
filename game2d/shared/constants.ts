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
// Never selectable at registration — the goblin-game's own
// consume-your-way-to-evolving mechanic that used to be the only way
// here was removed entirely (a later follow-up ask: "there is no
// evolution through consuming in the wizard world"). Kept only so any
// pre-existing character already on this race still types/renders
// correctly; no new character can ever become one.
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
// Floro's shops. Simplified per a follow-up ask: the Grand Staircase,
// Dungeon Corridor, and the whole first/second-floor corridor concept
// (along with every classroom that used to hang off them) were removed —
// see the "2nd floor deferred" project memory note. Every house common
// room AND every classroom now connects directly to the Entrance Hall.
export const GRIMOAK_CASTLE_MAPS = [
  'Grimoak Entrance Hall',
  'Great Hall',
  'Thistledown Common Room',
  'Duskwing Common Room',
  'Emberclaw Common Room',
  'Starfall Common Room',
  // Formerly "Elemental Casting Classroom" (a later follow-up ask) —
  // renamed and deliberately dropped from CLASSROOM_MAPS below (it's not
  // considered a classroom anymore; its own teacher instead gates a
  // level-10 "choose your path as a mage" specialization choice, not
  // spell-podium teaching — irrigo's own podium moved to Utility
  // Classroom). Still classroom-SIZED though (see WorldScene's own
  // explicit `|| 'Specialization'` fallbacks, same pattern Caverna
  // Secretissima already uses for the same reason).
  'Specialization',
  'Defense Classroom',
  'Summoning Classroom',
  'Utility Classroom',
  'Offense Classroom',
  // The secret bonus room (a follow-up ask) — a small locked room behind
  // the Utility Classroom's own teacher, holding the treasure chest that
  // grants map access. Included here so it's always-lit and gets the
  // same automatic wall torches every other castle room does (see
  // shared/lighting.ts's ALWAYS_LIT_MAPS/torchWallPositionsFor).
  'Caverna Secretissima',
  // The 4 house Dorms rooms (a later follow-up ask) — same "always lit,
  // stone floor, grouped under the Grimoak world in the map modal"
  // treatment as every other castle interior; explicitly excluded from
  // fireplacePositionsFor's own default 4-fireplace layout though (a
  // small bedroom doesn't need them — see that function's own early
  // return, same as Caverna Secretissima).
  'Thistledown Dorms',
  'Duskwing Dorms',
  'Emberclaw Dorms',
  'Starfall Dorms',
] as const;

// Classroom-sized rooms (a follow-up ask: "a third of the size" of the
// standard ROOM_ROWS/COLS footprint, see shared/maps.ts's CLASSROOM_ROWS/
// COLS) — the only 5 classrooms in the castle now. WorldScene uses this
// list to zoom the camera in for these specific rooms so the smaller
// footprint still fills the screen (see mapRender.ts's CLASSROOM_ZOOM);
// the house common rooms/Great Hall/Entrance Hall stay at the standard
// size/zoom.
// A follow-up ask renamed Utilization to Utility, and every classroom now
// carries an explicit "Classroom" suffix (another follow-up ask, "so it
// reads clearly everywhere") — these ARE the map's real MapName now, not
// just a display label, so every door/teacher/podium reference below
// uses the full "<Subject> Classroom" string.
// 'Specialization' (formerly Elemental Casting Classroom) is deliberately
// NOT here anymore (a later follow-up ask: "this room should not be
// considered a classroom") — see this file's own GRIMOAK_CASTLE_MAPS
// comment for why.
export const CLASSROOM_MAPS = ['Defense Classroom', 'Summoning Classroom', 'Utility Classroom', 'Offense Classroom'] as const;

// The 4 house common rooms — standard ROOM_ROWS/COLS-sized, unlike the
// shrunk classrooms above. Used to give them the same "closer to the
// walls, chairs in the center" treatment as the Entrance Hall (a
// follow-up ask: "common rooms right now should look very similar to
// entrance hall" — see shared/lighting.ts's fireplacePositionsFor/
// benchPositionsFor).
export const COMMON_ROOM_MAPS = ['Thistledown Common Room', 'Duskwing Common Room', 'Emberclaw Common Room', 'Starfall Common Room'] as const;

// A small "Dorms" room off each house common room (a later follow-up
// ask) — 5 beds apiece (see shared/lighting.ts's bedPositionsFor). Named
// after their own common room, same convention as the rest of the
// castle's per-house naming — already part of GRIMOAK_CASTLE_MAPS above
// (and so MAP_NAMES below); listed again here just for bedPositionsFor's
// own convenient lookup.
export const DORM_MAPS = ['Thistledown Dorms', 'Duskwing Dorms', 'Emberclaw Dorms', 'Starfall Dorms'] as const;

// The 4 houses themselves (a follow-up ask: "the player should only be
// allowed in their assigned common room/dorms") — bare names, one per
// COMMON_ROOM_MAPS/DORM_MAPS entry (each literally "<House> Common Room"/
// "<House> Dorms"), so a player's own chosen HouseName can be turned back
// into either room name with a plain template literal — see
// houseCommonRoomFor/houseDormsFor below.
export const HOUSE_NAMES = ['Thistledown', 'Duskwing', 'Emberclaw', 'Starfall'] as const;
export type HouseName = (typeof HOUSE_NAMES)[number];

export function houseCommonRoomFor(house: HouseName): (typeof COMMON_ROOM_MAPS)[number] {
  return `${house} Common Room`;
}

export function houseDormsFor(house: HouseName): (typeof DORM_MAPS)[number] {
  return `${house} Dorms`;
}

// Which house (if any) a given Common Room/Dorms map belongs to — the
// inverse of houseCommonRoomFor/houseDormsFor, used to gate entry (see
// game.gateway.ts's handleMove): undefined for every map that isn't a
// house's own common room/dorms (nothing to gate).
export function houseForMap(map: MapName): HouseName | undefined {
  return HOUSE_NAMES.find((house) => map === houseCommonRoomFor(house) || map === houseDormsFor(house));
}

// The 6 specialization paths (a follow-up ask) — mechanics TBD, this
// batch just records the player's choice (see game.gateway.ts's
// handleChooseSpecialization).
export const SPECIALIZATION_PATHS = ['fire', 'water', 'lightning', 'earth', 'light', 'dark'] as const;
export type SpecializationPath = (typeof SPECIALIZATION_PATHS)[number];

// Shared between the client's own live dialogue check (src/ui/
// npcDialogueModal.ts's openSpecializationDialogue) and the server's
// re-validation (game.gateway.ts's handleChooseSpecialization) so the
// two can never drift apart.
export const SPECIALIZATION_LEVEL_REQUIREMENT = 10;

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
export const MONSTER_KINDS = ['wild goblin', 'wild skeleton', 'imp'] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];

// Same idea as the text game's own monster classification — determines
// which resistance skill (lesser normal/undead monster resistance)
// reduces a monster's counter-attack damage against the player who hit it.
export type MonsterClass = 'normal' | 'undead';
