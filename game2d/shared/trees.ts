import { getMap } from './maps.js';
import type { MapName } from './constants.js';

// A single source of truth for the Great Plains' 30 decorative trees —
// both the server (movement/spawn collision) and the client (rendering)
// need the EXACT same 30 tile positions, so this is computed from a fixed
// seed (not Math.random()) rather than duplicated in each place. See
// game2d/src/treeSprite.ts for the visual side.
const GREAT_PLAINS_TREE_COUNT = 30;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.345) * 57123.671;
  return x - Math.floor(x);
}

export function treePositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (mapName !== 'Great Plains') return [];
  const def = getMap(mapName);
  const midRow = Math.floor(def.rows / 2);
  const midCol = Math.floor(def.cols / 2);
  const positions: Array<{ row: number; col: number }> = [];
  let seed = 0;
  while (positions.length < GREAT_PLAINS_TREE_COUNT) {
    seed += 1;
    const row = Math.floor(seededRandom(seed * 2) * def.rows);
    const col = Math.floor(seededRandom(seed * 2 + 1) * def.cols);
    if (def.exits.some((e) => Math.abs(e.row - row) <= 2 && Math.abs(e.col - col) <= 2)) continue;
    if (Math.abs(row - midRow) <= 2 && Math.abs(col - midCol) <= 2) continue;
    positions.push({ row, col });
  }
  return positions;
}

const treeTileCache = new Map<MapName, Set<string>>();

// Memoized — called on every move/spawn check, and the position list
// itself never changes at runtime.
export function isTreeTile(mapName: MapName, row: number, col: number): boolean {
  let set = treeTileCache.get(mapName);
  if (!set) {
    set = new Set(treePositionsFor(mapName).map((p) => `${p.row},${p.col}`));
    treeTileCache.set(mapName, set);
  }
  return set.has(`${row},${col}`);
}
