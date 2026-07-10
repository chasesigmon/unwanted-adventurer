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

// Same idea as the text game's own monster classification — determines
// which resistance skill (lesser normal/undead monster resistance)
// reduces a monster's counter-attack damage against the player who hit it.
export type MonsterClass = 'normal' | 'undead';
