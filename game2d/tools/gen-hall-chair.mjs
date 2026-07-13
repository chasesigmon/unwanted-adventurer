// Pixel-art generator for the Great Hall's own dining chairs (a follow-up
// ask: "add a long wooden table... along with wooden chairs on both
// sides"). Unlike gen-chair.mjs's older front-view chair (superseded by
// benches and unused), this one is drawn TOP-DOWN with its backrest on
// its own north edge by default, same rotation convention as
// gen-bench.mjs — WorldScene rotates this one texture per seat position
// so a chair on the table's north side faces south (angle 0) and one on
// the south side faces north (angle 180), etc. See
// shared/lighting.ts's greatHallChairPositionsFor.
//
// Run with `node tools/gen-hall-chair.mjs` from game2d/; requires the
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

const CHAIR_COLS = 10;
const CHAIR_ROWS = 10;
const CHAIR_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildHallChair() {
  const grid = createGrid(CHAIR_COLS, CHAIR_ROWS);

  // Backrest (north edge).
  grid.fillRect(1, 0, CHAIR_COLS - 2, 2, WOOD_DARK);

  // Seat.
  grid.fillRect(0, 2, CHAIR_COLS, 5, WOOD_LIGHT);
  grid.fillRect(0, 6, CHAIR_COLS, 1, WOOD);

  // Legs (south edge).
  const legCols = [1, CHAIR_COLS - 3];
  for (const x of legCols) grid.fillRect(x, 7, 2, 3, WOOD_DARK);

  return grid;
}

rasterize(buildHallChair(), CHAIR_COLS, CHAIR_ROWS, CHAIR_CELL, join(ASSETS_DIR, 'hall-chair.png'));
