// Two small tile textures for Runestone Canyon (a later follow-up ask:
// "make it look like a canyon and make it so that a player has to walk
// down what looks like stairs down into the canyon or can walk around
// the entire canyon in a circle") — a darker, cracked canyon-floor tile
// for the inner square (distinct from the rocky boulder-field the outer
// rim already uses), and a repeating stairs tile (alternating light/dark
// horizontal step bands) for the cosmetic strip connecting them. Uses the
// new canvas+sharp generation pipeline (see tools/lib/spriteCanvas.mjs).
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createGrid, rasterizeSingleImage } from './lib/spriteCanvas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 2;
const COLS = 16;
const ROWS = 16;

// ---------- canyon-floor.png — a deep reddish-brown cracked rock floor.
const FLOOR_BASE = 0x6b3a2c;
const FLOOR_DARK = 0x4a2419;
const FLOOR_LIGHT = 0x8a4f3a;
const CRACK = 0x2e140d;

function buildCanyonFloor() {
  const grid = createGrid(COLS, ROWS);
  grid.fillRect(0, 0, COLS, ROWS, FLOOR_BASE);
  // A few irregular darker/lighter patches for a weathered-rock look.
  grid.fillRect(1, 2, 4, 3, FLOOR_DARK);
  grid.fillRect(9, 1, 5, 4, FLOOR_LIGHT);
  grid.fillRect(2, 9, 5, 4, FLOOR_LIGHT);
  grid.fillRect(10, 10, 4, 4, FLOOR_DARK);
  // Thin crack lines.
  for (let i = 0; i < COLS; i++) grid.set(i, 8, CRACK);
  for (let i = 0; i < ROWS; i++) grid.set(6, i, i % 3 === 0 ? CRACK : FLOOR_BASE);
  return grid;
}

// ---------- stairs.png — alternating horizontal step bands, tiled
// vertically down the cosmetic stairs strip.
const STEP_LIGHT = 0x9a7a5c;
const STEP_DARK = 0x5c4530;
const STEP_EDGE = 0x2e2013;

function buildStairs() {
  const grid = createGrid(COLS, ROWS);
  const bandH = 4;
  for (let y = 0; y < ROWS; y += bandH) {
    const shade = (y / bandH) % 2 === 0 ? STEP_LIGHT : STEP_DARK;
    grid.fillRect(0, y, COLS, bandH - 1, shade);
    grid.fillRect(0, y + bandH - 1, COLS, 1, STEP_EDGE);
  }
  return grid;
}

await rasterizeSingleImage(buildCanyonFloor(), CELL, COLS, ROWS, join(ASSETS_DIR, 'canyon-floor-tile.png'));
await rasterizeSingleImage(buildStairs(), CELL, COLS, ROWS, join(ASSETS_DIR, 'canyon-stairs-tile.png'));
