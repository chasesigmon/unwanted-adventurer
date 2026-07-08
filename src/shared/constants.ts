export interface MapSize {
  rows: number;
  cols: number;
}

export const MAP_SIZES = {
  Labyrinth: { rows: 15, cols: 15 },
  'Great Plains': { rows: 60, cols: 60 },
  // Rival towns (lore only) — each connects to Great Plains at one of its
  // center-row edges (Floro on the west/left, Kortho on the east/right —
  // see game/maps.ts). Both are otherwise ordinary registered maps.
  Floro: { rows: 20, cols: 20 },
  Kortho: { rows: 20, cols: 20 },
} as const satisfies Record<string, MapSize>;

// Derived from MAP_SIZES rather than hand-maintained, so adding a map here
// automatically flows through every place that types against MapName.
export type MapName = keyof typeof MAP_SIZES;

export const STARTING_MAP: MapName = 'Labyrinth';

// Maps that function as a town — see GameGateway's town-entry gate, which
// blocks any "monster"-classified race (see RACE_CLASSIFICATION below)
// from crossing into one unless fully equipped and wearing a mask.
export const TOWN_MAPS: MapName[] = ['Floro', 'Kortho'];

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

// Every playable race so far is a monstrous one (there's no "normal"/human
// option) — this classification is what the town-entry gate (see
// TOWN_MAPS/GameGateway) checks, rather than hardcoding a race list there.
// A future non-monstrous race would simply map to something else here and
// pass through freely.
export type RaceClassification = 'monster';
export const RACE_CLASSIFICATION: Record<Race, RaceClassification> = {
  goblin: 'monster',
  hobgoblin: 'monster',
  skeleton: 'monster',
  zombie: 'monster',
  dragonborn: 'monster',
  slime: 'monster',
};
