export interface MapSize {
  rows: number;
  cols: number;
}

export const MAP_SIZES = {
  Labyrinth: { rows: 15, cols: 15 },
  World: { rows: 60, cols: 60 },
} as const satisfies Record<string, MapSize>;

// Derived from MAP_SIZES rather than hand-maintained, so adding a map here
// automatically flows through every place that types against MapName.
export type MapName = keyof typeof MAP_SIZES;

export const STARTING_MAP: MapName = 'Labyrinth';
