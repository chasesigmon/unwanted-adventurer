export type Direction = 'north' | 'south' | 'east' | 'west';

// Keyed by the raw command token (string), not Direction — arbitrary user
// input is looked up here, so a miss (undefined) is a real, expected case.
export const DIRECTION_ALIASES: Record<string, Direction> = {
  w: 'north',
  up: 'north',
  s: 'south',
  down: 'south',
  a: 'west',
  d: 'east',
};

export interface DirectionDelta {
  dr: number;
  dc: number;
}

export const DIRECTION_DELTAS: Record<Direction, DirectionDelta> = {
  north: { dr: -1, dc: 0 },
  south: { dr: 1, dc: 0 },
  west: { dr: 0, dc: -1 },
  east: { dr: 0, dc: 1 },
};
