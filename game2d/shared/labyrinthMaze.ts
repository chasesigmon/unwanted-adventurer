// A real, navigable maze for the Labyrinth (a later follow-up ask:
// "update the Labyrinth to be like an actual labyrinth with stone walls
// and paths, like a big maze"). Same "single source of truth computed
// from a fixed seed, both server (movement collision) and client
// (rendering) read the exact same tile set" shape as shared/trees.ts's
// own tree scatter — a real WALLED maze (unlike trees.ts's own deliberate
// "dense scatter, not true corridors" choice for Mystical Timberland)
// needs actual guaranteed-connected corridors, so this uses a classic
// recursive-backtracker instead of scatter-and-verify.
//
// A later follow-up ask ("the walls are so close together that you can't
// even tell where to walk to fit through, reduce the number and make it
// look better") reworked this from the original "cell on every EVEN tile,
// wall/connector on every ODD tile" grid (1-tile-wide cells AND corridors
// — a dense thicket) into wider, multi-tile CELL BLOCKS connected by
// equally wide corridors, with a THIN single-tile wall between them —
// still a real spanning-tree maze (every block is guaranteed reachable),
// just with corridors wide enough to actually read as a path rather than
// a maze of solid rock with pinholes through it.
import { LABYRINTH_SIZE } from './maps.js';
import type { MapName } from './constants.js';

// Each logical maze cell is a CELL_OPEN_SIZE x CELL_OPEN_SIZE block of
// open floor; WALL_THICKNESS-thick walls separate adjacent blocks unless
// a passage between them was carved. PITCH is the tile distance between
// two adjacent blocks' own origins.
const CELL_OPEN_SIZE = 3;
const WALL_THICKNESS = 1;
const PITCH = CELL_OPEN_SIZE + WALL_THICKNESS;
// 15 cells per axis, covering rows/cols 0-58 — deliberately one short of
// LABYRINTH_SIZE(60) on each edge: row/col 59 stays a permanently-open
// 1-tile border strip, doubling as the entrance foyer for the south door
// (see shared/maps.ts's own Labyrinth exit, which lands at row
// LABYRINTH_SIZE-1, col LABYRINTH_MID_COL) — the tile directly north of
// it, (58, 30), always falls inside the last row of cell block (14, 7)'s
// own open interior (see the entrance-guarantee note in
// generateLabyrinthWalls below), so the door always opens straight into
// open floor with no special-casing needed.
const MAZE_CELL_COUNT = Math.floor(LABYRINTH_SIZE / PITCH);

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.345) * 57123.671;
  return x - Math.floor(x);
}

// Iterative (not recursive) so a large maze can't ever risk a call-stack
// overflow — a plain array used as the backtracking stack instead.
function generateLabyrinthWalls(): Set<string> {
  const walls = new Set<string>();
  const span = (MAZE_CELL_COUNT - 1) * PITCH + CELL_OPEN_SIZE - 1; // 58 — the last valid wall-grid coordinate
  for (let row = 0; row <= span; row++) {
    for (let col = 0; col <= span; col++) {
      walls.add(`${row},${col}`);
    }
  }

  const cellKey = (ci: number, cj: number) => `${ci},${cj}`;

  // Clears an entire CELL_OPEN_SIZE x CELL_OPEN_SIZE block — a visited
  // cell is fully open floor, not just its own single anchor tile.
  const carveCell = (ci: number, cj: number): void => {
    const baseRow = ci * PITCH;
    const baseCol = cj * PITCH;
    for (let r = 0; r < CELL_OPEN_SIZE; r++) {
      for (let c = 0; c < CELL_OPEN_SIZE; c++) {
        walls.delete(`${baseRow + r},${baseCol + c}`);
      }
    }
  };

  // Clears the WALL_THICKNESS-thick band directly between two ADJACENT
  // cells (sharing a row or column index), spanning the full
  // CELL_OPEN_SIZE width of the passage — a full-width doorway between
  // the two open blocks, not a single pinhole.
  const carveConnector = (ci: number, cj: number, ni: number, nj: number): void => {
    if (ci === ni) {
      // Adjacent columns (east/west neighbor) — same row band, connector
      // sits right after the westmost cell's own block.
      const rowBase = ci * PITCH;
      const colBase = Math.min(cj, nj) * PITCH + CELL_OPEN_SIZE;
      for (let r = 0; r < CELL_OPEN_SIZE; r++) {
        for (let c = 0; c < WALL_THICKNESS; c++) {
          walls.delete(`${rowBase + r},${colBase + c}`);
        }
      }
    } else {
      // Adjacent rows (north/south neighbor) — same column band,
      // connector sits right after the northmost cell's own block.
      const colBase = cj * PITCH;
      const rowBase = Math.min(ci, ni) * PITCH + CELL_OPEN_SIZE;
      for (let r = 0; r < WALL_THICKNESS; r++) {
        for (let c = 0; c < CELL_OPEN_SIZE; c++) {
          walls.delete(`${rowBase + r},${colBase + c}`);
        }
      }
    }
  };

  const visited = new Set<string>();
  let seedCounter = 0;
  const nextRandom = () => {
    seedCounter += 1;
    return seededRandom(seedCounter);
  };

  const startCi = 0;
  const startCj = MAZE_CELL_COUNT - 1;
  const stack: Array<[number, number]> = [[startCi, startCj]];
  visited.add(cellKey(startCi, startCj));
  carveCell(startCi, startCj);

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
    carveCell(nci, ncj);
    carveConnector(ci, cj, nci, ncj);
    stack.push([nci, ncj]);
  }

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
