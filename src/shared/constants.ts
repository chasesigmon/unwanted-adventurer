export interface MapSize {
  rows: number;
  cols: number;
}

export const MAP_SIZES = {
  Labyrinth: { rows: 15, cols: 15 },
  'Great Plains': { rows: 60, cols: 60 },
} as const satisfies Record<string, MapSize>;

// Derived from MAP_SIZES rather than hand-maintained, so adding a map here
// automatically flows through every place that types against MapName.
export type MapName = keyof typeof MAP_SIZES;

export const STARTING_MAP: MapName = 'Labyrinth';

// Chosen at registration (see AuthScreen's race select, which maps over
// this list directly — not ALL_RACES below). A real union type (not a bare
// `string`) so adding another race later is a compile-time-checked change
// everywhere it's used, the same reasoning as MapName above.
export const RACES = ['goblin', 'skeleton', 'zombie', 'dragonborn', 'slime'] as const;

// Reached only by evolving (see GameGateway.maybeEvolveToHobgoblin) — never
// offered at registration, so kept out of RACES/AuthScreen's select.
export const EVOLVED_RACES = ['hobgoblin'] as const;

// Every value the `race` field can actually hold, selectable or not — this
// is what Race/the Player schema's enum are built from, so a persisted
// evolved race is never rejected as "invalid".
export const ALL_RACES = [...RACES, ...EVOLVED_RACES] as const;
export type Race = (typeof ALL_RACES)[number];
