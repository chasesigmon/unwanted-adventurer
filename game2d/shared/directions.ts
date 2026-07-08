import type { Direction } from './constants.js';

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
