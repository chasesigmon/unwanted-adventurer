// The only two playable races — the sprites this project actually draws
// (see assets/goblin-spritesheet.png, assets/skeleton-spritesheet.png).
// Kept separate from the text game's much longer race list
// (src/shared/constants.ts there) since this project has nothing to do
// with that one.
export const RACES = ['goblin', 'skeleton'] as const;
export type Race = (typeof RACES)[number];

export const MAP_NAMES = ['Great Plains', 'Labyrinth', 'Floro', 'Kortho'] as const;
export type MapName = (typeof MAP_NAMES)[number];

export const STARTING_MAP: MapName = 'Great Plains';

// Floro and Kortho are rival towns off the Great Plains's west/east
// edges — entry is gated (see game.gateway.ts's canEnterTown), same idea
// as the text game's own town-guard gate, simplified down to this
// project's single equipment slot: you need a weapon equipped to pass.
export const TOWN_MAPS: MapName[] = ['Floro', 'Kortho'];

export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// Wild monsters — deliberately named "wild goblin"/"wild skeleton" (not
// bare "goblin"/"skeleton") so they're never confused with the
// player-choosable races above, same disambiguation the text game's own
// monster kinds use.
export const MONSTER_KINDS = ['wild goblin', 'wild skeleton'] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];
