// Pixel-art generator for the Great Hall faculty stage's own "bigger
// chair" (a follow-up ask: "one bigger chair in the middle of the stage
// in the middle of those other 6 chairs"). Same top-down,
// backrest-on-north-edge rotation convention as gen-hall-chair.mjs (see
// that file's own header comment) so WorldScene can rotate it exactly
// like the other seats — just larger, with armrests and a gold trim
// stripe on the backrest so it visually reads as the special seat among
// the row of plain chairs.
//
// Run with `node tools/gen-head-chair.mjs` from game2d/; requires the
// `pngjs` devDependency (already installed for the other gen-*.mjs
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

const CHAIR_COLS = 14;
const CHAIR_ROWS = 16;
const CHAIR_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;
const GOLD = 0xc9a227;

function buildHeadChair() {
  const grid = createGrid(CHAIR_COLS, CHAIR_ROWS);

  // Tall backrest with a gold trim stripe along its top edge.
  grid.fillRect(1, 0, CHAIR_COLS - 2, 4, WOOD_DARK);
  grid.fillRect(1, 0, CHAIR_COLS - 2, 1, GOLD);

  // Armrests along the sides.
  grid.fillRect(0, 4, 2, 4, WOOD_DARK);
  grid.fillRect(CHAIR_COLS - 2, 4, 2, 4, WOOD_DARK);

  // Seat.
  grid.fillRect(0, 8, CHAIR_COLS, 5, WOOD_LIGHT);
  grid.fillRect(0, 12, CHAIR_COLS, 1, WOOD);

  // Legs (south edge).
  const legCols = [1, CHAIR_COLS - 3];
  for (const x of legCols) grid.fillRect(x, 13, 2, 3, WOOD_DARK);

  return grid;
}

rasterize(buildHeadChair(), CHAIR_COLS, CHAIR_ROWS, CHAIR_CELL, join(ASSETS_DIR, 'head-chair.png'));
