// The only two playable races — the sprites this project actually draws
// (see assets/goblin-spritesheet.png, assets/skeleton-spritesheet.png).
// Kept separate from the text game's much longer race list
// (src/shared/constants.ts there) since this project has nothing to do
// with that one.
export const RACES = ['goblin', 'skeleton'] as const;
export type Race = (typeof RACES)[number];

export const MAP_NAMES = ['Great Plains', 'Labyrinth'] as const;
export type MapName = (typeof MAP_NAMES)[number];

export const STARTING_MAP: MapName = 'Great Plains';

export const DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];
