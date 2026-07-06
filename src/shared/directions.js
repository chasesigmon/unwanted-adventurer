// Maps the six command tokens the game accepts to the four directions
// they move on the grid. Shared so the server (validation) and any client
// help text stay in sync with exactly one definition.
export const DIRECTION_ALIASES = {
  w: 'north',
  up: 'north',
  s: 'south',
  down: 'south',
  a: 'west',
  d: 'east',
};

export const DIRECTION_DELTAS = {
  north: { dr: -1, dc: 0 },
  south: { dr: 1, dc: 0 },
  west: { dr: 0, dc: -1 },
  east: { dr: 0, dc: 1 },
};
