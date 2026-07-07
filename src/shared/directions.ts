export type Direction = 'north' | 'south' | 'east' | 'west';

// Keyed by the raw command token (string), not Direction — arbitrary user
// input is looked up here, so a miss (undefined) is a real, expected case.
// Compass-initial single letters only (n/s/e/w) — "u"/"d" are reserved for
// up/down once vertical movement exists, but aren't real Directions yet,
// so they're handled separately in GameGateway rather than aliased here.
export const DIRECTION_ALIASES: Record<string, Direction> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
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
