// A real, navigable maze for the Labyrinth (a later follow-up ask:
// "update the Labyrinth to be like an actual labyrinth with stone walls
// and paths, like a big maze"). Same "single source of truth computed
// from a fixed seed, both server (movement collision) and client
// (rendering) read the exact same tile set" shape as shared/trees.ts's
// own tree scatter — a real WALLED maze (unlike trees.ts's own deliberate
// "dense scatter, not true corridors" choice for Mystical Timberland)
// needs actual guaranteed-connected corridors, so this uses a classic
// recursive-backtracker instead of scatter-and-verify.
import { LABYRINTH_SIZE, LABYRINTH_MID_COL } from './maps.js';
import type { MapName } from './constants.js';

// Cells sit at EVEN (row,col) coordinates, walls/connectors at ODD ones —
// the standard "maze on a grid twice the cell size" representation. 30
// cells per axis at coordinates 0,2,4,...,58 covers rows/cols 0-58,
// deliberately one short of LABYRINTH_SIZE(60) on each edge: row/col 59
// stays a permanently-open 1-tile border strip, doubling as the entrance
// foyer for the south door (see shared/maps.ts's own Labyrinth exit,
// which lands at row LABYRINTH_SIZE-1, col LABYRINTH_MID_COL) — the tile
// directly north of it, (58, 30), is always a real maze cell (even,even),
// so the door always opens straight into the maze with no special-casing
// needed.
const MAZE_CELL_COUNT = Math.floor(LABYRINTH_SIZE / 2);

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.345) * 57123.671;
  return x - Math.floor(x);
}

// Iterative (not recursive) so a 900-cell maze can't ever risk a call-
// stack overflow — a plain array used as the backtracking stack instead.
function generateLabyrinthWalls(): Set<string> {
  const walls = new Set<string>();
  const span = (MAZE_CELL_COUNT - 1) * 2; // 58 — the last valid cell coordinate
  for (let row = 0; row <= span; row++) {
    for (let col = 0; col <= span; col++) {
      walls.add(`${row},${col}`);
    }
  }

  const cellKey = (ci: number, cj: number) => `${ci},${cj}`;
  const cellTile = (ci: number, cj: number) => ({ row: ci * 2, col: cj * 2 });
  const visited = new Set<string>();
  let seedCounter = 0;
  const nextRandom = () => {
    seedCounter += 1;
    return seededRandom(seedCounter);
  };

  const startCi = 0;
  const startCj = MAZE_CELL_COUNT - 1; // near the entrance's own column (58,30 is close to cell col 15 of 0-29 — start doesn't need to align, just deterministic)
  const stack: Array<[number, number]> = [[startCi, startCj]];
  visited.add(cellKey(startCi, startCj));
  const startTile = cellTile(startCi, startCj);
  walls.delete(`${startTile.row},${startTile.col}`);

  while (stack.length > 0) {
    const [ci, cj] = stack[stack.length - 1]!;
    const allNeighbors: Array<[number, number]> = [
      [ci - 1, cj],
      [ci + 1, cj],
      [ci, cj - 1],
      [ci, cj + 1],
    ];
    const candidates = allNeighbors.filter(
      ([nci, ncj]) => nci >= 0 && nci < MAZE_CELL_COUNT && ncj >= 0 && ncj < MAZE_CELL_COUNT && !visited.has(cellKey(nci, ncj))
    );

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }
    const [nci, ncj] = candidates[Math.floor(nextRandom() * candidates.length)]!;
    visited.add(cellKey(nci, ncj));
    const curTile = cellTile(ci, cj);
    const nextTile = cellTile(nci, ncj);
    walls.delete(`${nextTile.row},${nextTile.col}`);
    walls.delete(`${(curTile.row + nextTile.row) / 2},${(curTile.col + nextTile.col) / 2}`);
    stack.push([nci, ncj]);
  }

  // The Labyrinth's own sign back to the Great Plains (a later follow-up
  // ask: shared/lighting.ts's LABYRINTH_GREAT_PLAINS_SIGN_POSITION) sits
  // on an ODD row (a wall/connector position that isn't guaranteed carved
  // open by the maze RNG above) — force it clear so the sign is never
  // embedded in a solid wall tile.
  const SIGN_ROW = LABYRINTH_SIZE - 1 - 2;
  const SIGN_COL = LABYRINTH_MID_COL - 4;
  walls.delete(`${SIGN_ROW},${SIGN_COL}`);

  return walls;
}

let cachedWalls: Set<string> | null = null;

function labyrinthWalls(): Set<string> {
  if (!cachedWalls) cachedWalls = generateLabyrinthWalls();
  return cachedWalls;
}

// Memoized (generation only ever needs to run once — the layout is fixed
// for the lifetime of the server process, same as shared/trees.ts's own
// cache) — called on every move/spawn/wander check.
export function isLabyrinthWallTile(mapName: MapName, row: number, col: number): boolean {
  if (mapName !== 'Labyrinth') return false;
  return labyrinthWalls().has(`${row},${col}`);
}

// The client needs the full tile list to actually draw the walls — same
// shape as shared/trees.ts's own treePositionsFor.
export function labyrinthWallPositions(): Array<{ row: number; col: number }> {
  return Array.from(labyrinthWalls()).map((key) => {
    const [row, col] = key.split(',').map(Number);
    return { row: row!, col: col! };
  });
}
