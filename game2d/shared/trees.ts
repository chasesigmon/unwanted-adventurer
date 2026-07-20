import { getMap, SILVERBRANCH_ROAD_MID_ROW, SILVERBRANCH_ROAD_HALF_WIDTH_TILES } from './maps.js';
import type { MapName } from './constants.js';

// A single source of truth for the Great Plains' 30 decorative trees —
// both the server (movement/spawn collision) and the client (rendering)
// need the EXACT same 30 tile positions, so this is computed from a fixed
// seed (not Math.random()) rather than duplicated in each place. See
// game2d/client/game/mapRender.ts for the visual side (TREE_TEXTURE_KEY).
const GREAT_PLAINS_TREE_COUNT = 30;

// Mystical Timberland (a later follow-up ask: "lots of trees spread out,
// even like the trees were a labyrinth that you need to navigate
// through... the trees should have collision") — same seeded-scatter
// technique as Great Plains above, just at a MUCH higher density (roughly
// a quarter of the map's own tiles) for that maze-like feel. Single-tile
// obstacles scattered this densely still leave the map fully navigable
// (verified via a one-off BFS reachability check from the entrance while
// tuning this number — a real walled maze would need deliberately
// connected corridors, which isn't what was asked for here, just a dense
// "forest you have to pick your way through").
const MYSTICAL_TIMBERLAND_TREE_DENSITY = 0.25;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 91.345) * 57123.671;
  return x - Math.floor(x);
}

function greatPlainsTreePositions(): Array<{ row: number; col: number }> {
  const def = getMap('Great Plains');
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

function mysticalTimberlandTreePositions(): Array<{ row: number; col: number }> {
  const def = getMap('Mystical Timberland');
  const targetCount = Math.round(def.rows * def.cols * MYSTICAL_TIMBERLAND_TREE_DENSITY);
  const positions: Array<{ row: number; col: number }> = [];
  const occupied = new Set<string>();
  let seed = 0;
  while (positions.length < targetCount) {
    seed += 1;
    const row = Math.floor(seededRandom(seed * 2) * def.rows);
    const col = Math.floor(seededRandom(seed * 2 + 1) * def.cols);
    const key = `${row},${col}`;
    if (occupied.has(key)) continue;
    // A wider clearing around every exit (not just the usual 2 tiles) —
    // the entrance is a 5-tile-wide band here (see roadBandExits), and a
    // player arriving shouldn't spawn wedged directly against a tree.
    if (def.exits.some((e) => Math.abs(e.row - row) <= 3 && Math.abs(e.col - col) <= 3)) continue;
    occupied.add(key);
    positions.push({ row, col });
  }
  return positions;
}

// A later follow-up ask: "add some trees on the grass with silver
// branches with collision to match the naming theme of the road" — a
// modest scatter (not a dense forest like Mystical Timberland above),
// confined to the grass strips flanking the walkable dirt-road band
// (never on the road itself), same seeded-scatter technique as every
// other map's own trees.
const SILVERBRANCH_ROAD_TREE_COUNT = 16;

function silverbranchRoadTreePositions(): Array<{ row: number; col: number }> {
  const def = getMap('Silverbranch Road');
  const positions: Array<{ row: number; col: number }> = [];
  const occupied = new Set<string>();
  let seed = 0;
  let attempts = 0;
  while (positions.length < SILVERBRANCH_ROAD_TREE_COUNT && attempts < 10000) {
    seed += 1;
    attempts += 1;
    const row = Math.floor(seededRandom(seed * 2) * def.rows);
    const col = Math.floor(seededRandom(seed * 2 + 1) * def.cols);
    const key = `${row},${col}`;
    if (occupied.has(key)) continue;
    if (Math.abs(row - SILVERBRANCH_ROAD_MID_ROW) <= SILVERBRANCH_ROAD_HALF_WIDTH_TILES) continue;
    if (def.exits.some((e) => Math.abs(e.row - row) <= 2 && Math.abs(e.col - col) <= 2)) continue;
    occupied.add(key);
    positions.push({ row, col });
  }
  return positions;
}

// A later follow-up ask: "its texture/background should be a haunted
// looking forest" — a moderate scatter (denser than Great Plains'
// scenic 30, nowhere near Mystical Timberland's maze-density) befitting
// a small, spooky woodland rather than open plains or a labyrinth.
const DIREFELL_TREE_DENSITY = 0.08;

function direfellTreePositions(): Array<{ row: number; col: number }> {
  const def = getMap('Direfell');
  const targetCount = Math.round(def.rows * def.cols * DIREFELL_TREE_DENSITY);
  const positions: Array<{ row: number; col: number }> = [];
  const occupied = new Set<string>();
  let seed = 0;
  let attempts = 0;
  while (positions.length < targetCount && attempts < 10000) {
    seed += 1;
    attempts += 1;
    const row = Math.floor(seededRandom(seed * 2) * def.rows);
    const col = Math.floor(seededRandom(seed * 2 + 1) * def.cols);
    const key = `${row},${col}`;
    if (occupied.has(key)) continue;
    if (def.exits.some((e) => Math.abs(e.row - row) <= 2 && Math.abs(e.col - col) <= 2)) continue;
    occupied.add(key);
    positions.push({ row, col });
  }
  return positions;
}

export function treePositionsFor(mapName: MapName): Array<{ row: number; col: number }> {
  if (mapName === 'Great Plains') return greatPlainsTreePositions();
  if (mapName === 'Mystical Timberland') return mysticalTimberlandTreePositions();
  if (mapName === 'Silverbranch Road') return silverbranchRoadTreePositions();
  if (mapName === 'Direfell') return direfellTreePositions();
  return [];
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
