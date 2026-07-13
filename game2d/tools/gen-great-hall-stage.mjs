// Pixel-art generator for the Great Hall's own faculty stage (a follow-up
// ask: "all the way to the very right of the Great Hall make a wooden
// stage... a seating area for the faculty while the students eat"). A
// plain raised wooden platform, top-down, with horizontal plank seams
// and a darker trim border reading as its own raised edge. No collision
// of its own (only the chairs sitting on top of it and the dining table
// block movement — see shared/lighting.ts's isGreatHallTableBlocked/
// isGreatHallChairBlocked), so it's purely decorative floor art.
//
// Sized to match greatHallStagePlatform's own server-side footprint (7
// tiles wide x 17 tiles tall) at this project's TILE_SIZE (32px/tile)
// and the same 4px "big pixel" cell every other simple furniture piece
// here uses.
//
// Run with `node tools/gen-great-hall-stage.mjs` from game2d/; requires
// the `pngjs` devDependency (already installed for the other gen-*.mjs
// scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function createGrid(cols, rows) {
  const cells = Array.from({ length: rows }, () => new Array(cols).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) cells[yy][xx] = color;
        }
      }
    },
  };
}

function rasterize(grid, cols, rows, cell, outPath) {
  const png = new PNG({ width: cols * cell, height: rows * cell });
  png.data.fill(0);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const color = grid.cells[cy][cx];
      if (!color) continue;
      const { r, g, b } = hex(color);
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const x = cx * cell + px;
          const y = cy * cell + py;
          const idx = (cols * cell * y + x) << 2;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${cols * cell}x${rows * cell})`);
}

// 7 tiles wide x 17 tiles tall at 8 cells/tile (TILE_SIZE 32 / CELL 4).
const STAGE_COLS = 56;
const STAGE_ROWS = 136;
const STAGE_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildStage() {
  const grid = createGrid(STAGE_COLS, STAGE_ROWS);

  // Raised-platform floor.
  grid.fillRect(0, 0, STAGE_COLS, STAGE_ROWS, WOOD_LIGHT);

  // Horizontal plank seams.
  for (let y = 6; y < STAGE_ROWS; y += 8) {
    grid.fillRect(0, y, STAGE_COLS, 1, WOOD);
  }

  // Raised-edge trim border.
  grid.fillRect(0, 0, STAGE_COLS, 2, WOOD_DARK);
  grid.fillRect(0, STAGE_ROWS - 2, STAGE_COLS, 2, WOOD_DARK);
  grid.fillRect(0, 0, 2, STAGE_ROWS, WOOD_DARK);
  grid.fillRect(STAGE_COLS - 2, 0, 2, STAGE_ROWS, WOOD_DARK);

  return grid;
}

rasterize(buildStage(), STAGE_COLS, STAGE_ROWS, STAGE_CELL, join(ASSETS_DIR, 'great-hall-stage.png'));
