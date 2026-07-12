// Pixel-art generator for the social benches (a follow-up ask: "update
// the chairs... to be benches that should be facing each other in square
// formation") — same no-Aseprite/pixel-mcp constraint, coarse "big pixel"
// grid rasterized to a real static PNG via pngjs, as every other simple
// furniture piece here (see gen-chair.mjs, which this replaces).
//
// Drawn top-down as a single texture: a wood plank with a backrest strip
// along its NORTH (top) edge — WorldScene rotates this one texture per
// position (0/90/180/270°) so each bench's backrest faces AWAY from the
// social cluster's own center and its seat faces INWARD, toward the
// other benches ("facing each other").
//
// Run with `node tools/gen-bench.mjs` from game2d/; requires the `pngjs`
// devDependency (already installed for the other gen-*.mjs scripts).
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

// A long wooden bench, top-down — wider than it is deep (seats more than
// one), a distinct backrest strip along the top (north) edge so its
// facing direction reads clearly once rotated.
const BENCH_COLS = 16;
const BENCH_ROWS = 10;
const BENCH_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildBench() {
  const grid = createGrid(BENCH_COLS, BENCH_ROWS);

  // Backrest (north edge).
  grid.fillRect(1, 0, BENCH_COLS - 2, 2, WOOD_DARK);

  // Seat.
  grid.fillRect(0, 2, BENCH_COLS, 4, WOOD_LIGHT);
  grid.fillRect(0, 5, BENCH_COLS, 1, WOOD_DARK);

  // Legs (south edge, 4 of them along the length).
  const legCols = [1, 5, BENCH_COLS - 6, BENCH_COLS - 2];
  for (const x of legCols) grid.fillRect(x, 6, 1, BENCH_ROWS - 6, WOOD_DARK);

  return grid;
}

rasterize(buildBench(), BENCH_COLS, BENCH_ROWS, BENCH_CELL, join(ASSETS_DIR, 'bench.png'));
