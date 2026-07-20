// The original 5 fantasy races each have their own spritesheet (see
// characterSprites.ts for the race->texture-key mapping; 'dragonborn'
// reuses the dragon-man-spritesheet.png asset). They're kept, not
// deleted, even though none of them is choosable at character creation
// anymore — this is a pivot in what NEW characters are, not a rewrite of
// the existing goblin-game mechanics those races still drive.
// 'human' was the wizarding-school pivot's only playable race for a
// while; a later follow-up ask restored race as a real character-creation
// choice, adding elf/half-elf/viravis/pixie alongside it (see
// RACE_STARTING_STATS below for each one's starting attributes) — gender/
// hairColor/skinTone customization (see GENDERS/HAIR_COLORS/SKIN_TONES)
// still applies to all 5 of these playable races, same as it did for
// human alone before.
export const RACES = ['goblin', 'skeleton', 'zombie', 'dragonborn', 'slime', 'human', 'elf', 'half-elf', 'viravis', 'pixie'] as const;
// The 5 races a player can actually pick at character creation (a later
// follow-up ask) — the original 5 fantasy races above stay in RACES only
// for existing/monster-side compatibility, never offered on the
// creation screen.
export const PLAYABLE_RACES = ['human', 'elf', 'half-elf', 'viravis', 'pixie'] as const;
export type PlayableRace = (typeof PLAYABLE_RACES)[number];

// Starting attribute spread per playable race (a later follow-up ask) —
// threaded through server/auth/auth.service.ts's createCharacter, which
// previously passed no overrides at all and silently relied on every
// attribute's own column default of 1. hp/mana/mv all start the same
// (100/100/200) regardless of race — only these 6 attributes vary.
export const RACE_STARTING_STATS: Record<
  PlayableRace,
  { strength: number; intelligence: number; wisdom: number; dexterity: number; constitution: number; luck: number }
> = {
  human: { strength: 10, intelligence: 10, wisdom: 10, dexterity: 10, constitution: 10, luck: 10 },
  elf: { strength: 8, intelligence: 12, wisdom: 8, dexterity: 12, constitution: 8, luck: 10 },
  'half-elf': { strength: 10, intelligence: 11, wisdom: 7, dexterity: 12, constitution: 10, luck: 10 },
  viravis: { strength: 9, intelligence: 11, wisdom: 10, dexterity: 12, constitution: 8, luck: 10 },
  pixie: { strength: 7, intelligence: 13, wisdom: 10, dexterity: 12, constitution: 8, luck: 10 },
};
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

// Kortho (a later follow-up ask: "add the town of Kortho back... same
// size and rules and shops as when it was being used before") — Floro's
// own rival-town twin (see shared/maps.ts's own Kortho MapDefinition,
// which already existed with the right size/terrain but no shops of its
// own, and TOWN_MAPS below, which already gated it the same way Floro
// is). Same 7-shop lineup as Floro, mirrored rather than shared, so
// either town's own roster can diverge independently later.
export const KORTHO_SHOP_MAPS = [
  'Kortho Blacksmith',
  'Kortho General Store',
  'Kortho Inn',
  'Kortho Bank',
  'Kortho Armorer',
  'Kortho Pet Salesman',
  // A later follow-up ask: "change one of the shops in Kortho to be a
  // 'Boat Shop'" — the Jobs Office was the one Kortho shop with no real
  // mechanics of its own yet (empty vendor items, "no postings on the
  // board today"), so it's the one repurposed rather than any shop that
  // was already stocked/functional.
  'Kortho Boat Shop',
] as const;

// Bramwick (a later follow-up ask) — a small village just north of
// Grimoak Grounds, dirt-road street with 4 shop cottages (same "real
// separate map, entered through a door on the street" shape as Floro's
// own shops — see shared/maps.ts). Mechanics for what's actually sold
// come later; these are greeting-only shopkeepers for now (see
// server/worlds/vendors.ts).
// A later follow-up ask renamed the wand shop to "Weapons" — wands are
// still sold there (see server/worlds/items.ts), just alongside other
// weapon-slot gear now, not the shop's whole identity.
// Phase C's own "pet shop cottage" ask — the pet vendor used to stand
// bare on Bramwick's open street (see server/worlds/vendors.ts); it gets
// its own 5th cottage now, same hub-and-spoke shape as the 4 above.
export const BRAMWICK_SHOP_MAPS = ['Bramwick General Shop', 'Bramwick Weapons', 'Bramwick Armor', 'Bramwick Potions', 'Bramwick Pet Shop'] as const;

// Gobbler Village (a later follow-up ask: "add a new World... called
// 'Gobbler Village'... a small village structure with huts to go into") —
// same "each hut is its own real interior map" shape as Bramwick's own
// shops above, just plain enterable huts rather than shops.
export const GOBBLER_VILLAGE_HUT_MAPS = ['Gobbler Hut 1', 'Gobbler Hut 2', 'Gobbler Hut 3'] as const;

// The 3 upper-floor landings (a later follow-up ask) — each a small hub
// room reached by stairs, hanging 5 specialization chambers off its own
// north wall (floors 2 and 3) or, for floor 4, nothing but 4 decorative
// portals (see shared/lighting.ts's portalPositionsFor) — mechanics for
// the portals and the specialization chambers themselves come later.
export const CASTLE_UPPER_FLOOR_MAPS = ['Grimoak Castle 2nd Floor', 'Grimoak Castle 3rd Floor', 'Grimoak Castle 4th Floor'] as const;

// One chamber per specialization path (see SPECIALIZATION_PATHS below) —
// the first 5 hang off the 2nd floor, the other 5 off the 3rd (see
// shared/maps.ts's floorLandingDefinition). Classroom-sized (same
// CLASSROOM_ROWS/COLS as the 5 ground-floor classrooms) but deliberately
// NOT added to CLASSROOM_MAPS below — "similar to the existing
// classrooms... but no desks in these rooms," same "classroom-sized but
// desk-free" carve-out the Specialization room already uses.
export const SPECIALIZATION_CHAMBER_MAPS = [
  'Necromancer Chamber',
  // A later follow-up ask renamed this specialization from Enhancer to
  // Shaman (mechanics to come later) — the chamber map name follows suit.
  'Shaman Chamber',
  'Elementalist Chamber',
  'Summoner Chamber',
  'Illusionist Chamber',
  'Battlemage Chamber',
  'Cleric Chamber',
  'Druid Chamber',
  'Diabolist Chamber',
  'Hemomancer Chamber',
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
  ...CASTLE_UPPER_FLOOR_MAPS,
  ...SPECIALIZATION_CHAMBER_MAPS,
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
// A later follow-up ask ("remove the Summoning classroom") dropped it
// from this list entirely — see teachers.ts for where its own stone wall
// spell moved (the Defense teacher) and shared/maps.ts's
// ENTRANCE_NORTH_DOORS for the re-spaced classroom doors.
export const CLASSROOM_MAPS = ['Defense Classroom', 'Utility Classroom', 'Offense Classroom'] as const;

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

// The 10 specialization paths (a later follow-up ask replaced the
// original elemental/light-dark set entirely with these) — mechanics
// TBD, this just records the player's choice (see game.gateway.ts's
// handleChooseSpecialization).
export const SPECIALIZATION_PATHS = [
  'necromancer',
  // A later follow-up ask renamed this path from Enhancer to Shaman —
  // mechanics come later (see item 34's follow-up ask for the first one).
  'shaman',
  'elementalist',
  'summoner',
  'illusionist',
  'battlemage',
  'cleric',
  'druid',
  'diabolist',
  'hemomancer',
] as const;
export type SpecializationPath = (typeof SPECIALIZATION_PATHS)[number];

// Shared between the client's own live dialogue check (src/ui/
// npcDialogueModal.ts's openSpecializationDialogue) and the server's
// re-validation (game.gateway.ts's handleChooseSpecialization) so the
// two can never drift apart.
export const SPECIALIZATION_LEVEL_REQUIREMENT = 10;

// Which specialization path (if any) a given chamber map belongs to — the
// inverse of the SPECIALIZATION_CHAMBER_MAPS/SPECIALIZATION_PATHS pairing
// above (same index in both arrays), used to gate entry (a later follow-up
// ask: "players can only enter the specialization room of what
// specialization they have chosen") the same way houseForMap already
// gates house common rooms/dorms — undefined for every map that isn't one
// of the 10 chambers (nothing to gate).
export function specializationForMap(map: MapName): SpecializationPath | undefined {
  const index = SPECIALIZATION_CHAMBER_MAPS.findIndex((chamber) => chamber === map);
  return index === -1 ? undefined : SPECIALIZATION_PATHS[index];
}

// The 4th floor's own 4 decorative portals actually lead somewhere now
// (a later follow-up ask) — one dungeon per portal, roughly scaled to
// the level range given: "level 10-15... 15-20... 20-30... 30-40." Real
// new maps (see shared/maps.ts), not just a flavor string — "it can be
// refined later," so this first pass reuses the 3 existing monster kinds
// (imp/wild skeleton/wild goblin) at escalating stats rather than
// standing up brand new creature types/sprites from scratch.
export const PORTAL_DUNGEON_MAPS = ['Sunken Crypt', 'Goblin Warcamp', 'Imp Hollow', 'Ashen Wastes'] as const;

export const MAP_NAMES = [
  'Great Plains',
  'Labyrinth',
  'Floro',
  'Kortho',
  ...FLORO_SHOP_MAPS,
  ...KORTHO_SHOP_MAPS,
  'Bramwick',
  ...BRAMWICK_SHOP_MAPS,
  'Grimoak Grounds',
  // A later follow-up ask: "add a dirt road going east out of Grimoak
  // grounds... Create 'Road to Kortho'" — the connecting corridor between
  // Grimoak Grounds and Kortho, same "real separate map" shape as every
  // other exit here.
  'Road to Kortho',
  // A later follow-up ask: "at the southwest of grimoak grounds add a
  // dirt road... that goes south, leading to Floro" — same "real
  // separate map" shape as Road to Kortho above.
  'Road to Floro',
  // A later follow-up ask: "create a new World/area called 'Mystical
  // Timberland' that is to the left of Grimoak Grounds" — connects
  // directly off the Grounds' own west edge, same single-shared-border
  // shape Bramwick's own north connection already uses.
  'Mystical Timberland',
  // A later follow-up ask: "add a new World from the southeast of
  // Grimoak Grounds called 'Gobbler Village'" — same direct
  // shared-border shape as Mystical Timberland/Bramwick above.
  'Gobbler Village',
  ...GOBBLER_VILLAGE_HUT_MAPS,
  // A later follow-up ask: "create a new world called 'Hexstone
  // Cavern'... a connection to the great plains from the southeast/
  // south" — a direct shared-border connection off Great Plains' own
  // northwest edge, same shape as Mystical Timberland/Gobbler Village
  // above.
  'Hexstone Cavern',
  // A later follow-up ask: "a cave connection to the west of Bramwick...
  // Brimstone Cave" — same direct shared-border cave shape as Hexstone
  // Cavern above.
  'Brimstone Cave',
  // A later follow-up ask: "a dirt road connection to the north of
  // Bramwick... Runestone Way... like the road to floro, except this
  // goes north" — a real separate corridor map, same shape as Road to
  // Kortho/Floro, but with boulder-walled off-road collision (see
  // shared/maps.ts's isRunestoneWayOffRoadBlocked).
  'Runestone Way',
  // A later follow-up ask: "a dirt road connection to the east of
  // Bramwick... Silverbranch Road... like the road to kortho going
  // east."
  'Silverbranch Road',
  // A later follow-up ask: "add a 1 tile dirt road connection... at the
  // northeast/east of Kortho... make the new world Direfell... level 20
  // dire wolves."
  'Direfell',
  ...GRIMOAK_CASTLE_MAPS,
  ...PORTAL_DUNGEON_MAPS,
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
  // Kortho's own 7 shops (a later follow-up ask) — same "<name> -
  // Building" convention as Floro's own shops above.
  const korthoPrefix = 'Kortho ';
  if (mapName.startsWith(korthoPrefix) && (KORTHO_SHOP_MAPS as readonly string[]).includes(mapName)) return mapName.slice(korthoPrefix.length);
  // Bramwick's own 4 shops (a later follow-up ask) — same "<name> -
  // Building" convention as Floro's own shops above.
  const bramwickPrefix = 'Bramwick ';
  if (mapName.startsWith(bramwickPrefix) && (BRAMWICK_SHOP_MAPS as readonly string[]).includes(mapName)) return mapName.slice(bramwickPrefix.length);
  // The castle's own rooms already read fine as their own names ("Great
  // Hall", "Alchemy", ...) without a building-suffix convention the way
  // Floro's shops needed one.
  if ((GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return mapName;
  // A follow-up bug fix: "the where in map modal for areas like Grimoak
  // grounds and Road to kortho are still not showing the area" — standing
  // on a town's own open street shows no suffix (a deliberate "no
  // building" case, unchanged from before), but every other open-world
  // area (Grimoak Grounds, Road to Kortho, Road to Floro, ...) should show
  // its own name rather than falling through to no label at all.
  if (mapName === 'Floro' || mapName === 'Kortho' || mapName === 'Bramwick') return null;
  return mapName;
}

// Which "world" a map belongs to, for grouping purposes — Floro's street
// AND all 7 of its shop interiors count as the same place (item 13: a
// player inside the Blacksmith should still show up in another Floro
// visitor's own Where tab, not just people on the exact same map value).
// Everywhere else is its own world of one.
// A later follow-up ask made explicit what this always should have been:
// "Grimoak grounds is its own world, Grimoak castle and all of its rooms
// are its own world" — these used to be merged into ONE group (a player
// on the open Grounds and a player in, say, the Great Hall showed up in
// each other's Where tab even though they're nowhere near each other),
// which is now split: the castle (and every room hanging off it) is its
// own group, and the Grounds — not itself a GRIMOAK_CASTLE_MAPS entry —
// falls through to the last line below and is its own group of one, same
// as it already was for Floro/Bramwick's own outdoor street.
export function townGroupFor(mapName: MapName): MapName {
  if (mapName === 'Floro' || (FLORO_SHOP_MAPS as readonly string[]).includes(mapName)) return 'Floro';
  if (mapName === 'Kortho' || (KORTHO_SHOP_MAPS as readonly string[]).includes(mapName)) return 'Kortho';
  if (mapName === 'Bramwick' || (BRAMWICK_SHOP_MAPS as readonly string[]).includes(mapName)) return 'Bramwick';
  if ((GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return 'Grimoak Entrance Hall';
  return mapName;
}

export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Wild monsters — deliberately named "wild goblin"/"wild skeleton" (not
// bare "goblin"/"skeleton") so they're never confused with the
// player-choosable races above, same disambiguation the text game's own
// monster kinds use.
// 'demon imp' (a later follow-up ask) is Diabolist-summon-only — never a
// wild spawn, so it has no MONSTER_SPECIES entry, no corpse, no
// carriedItemRolls; see game.gateway.ts's handleCastSummonDemonImp.
// A later follow-up ask: "Direfell should have level 20 dire wolves...
// in the great plains add level 20 bears" — 'bear' reuses the same
// species entry shape as every other wild monster (see server/monsters/
// monster.ts), just its own sprite/stats.
export const MONSTER_KINDS = [
  'wild goblin',
  'wild skeleton',
  'imp',
  'demon imp',
  'dire wolf',
  'bear',
  'wolf',
  'moose',
  'falcon',
  'gobbler',
  'gobbler necromancer',
  'gobbler warrior',
  'gobbler chieftain',
  'coven witch',
  'troll',
  'rune beast',
  'woodland fairy',
] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];

// Same idea as the text game's own monster classification — determines
// which resistance skill (lesser normal/undead monster resistance)
// reduces a monster's counter-attack damage against the player who hit it.
// 'beast' (a later follow-up ask: "classify the wolves, bears, and dire
// wolves... as beast") is a pure taxonomy tag for now — every check
// against monsterClass elsewhere already treats anything that isn't
// 'undead' as the ordinary "normal" resistance bucket (a plain ternary,
// not an exhaustive switch), so a beast's counter-attack is mitigated the
// same way a normal monster's is; the tag's own immediate purpose is
// Tame Beast's own "requires a beast selected" targeting check (see
// game.gateway.ts's handleCastTameBeast).
export type MonsterClass = 'normal' | 'undead' | 'beast';
