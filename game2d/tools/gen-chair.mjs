// Pixel-art generator for the Entrance Hall/common-room social chairs (a
// follow-up ask: "add some chair sprites... for social activity and
// talking"). Same no-Aseprite/pixel-mcp constraint, coarse "big pixel"
// grid rasterized to a real static PNG via pngjs, as every other simple
// furniture piece here (see gen-teacher-desk.mjs's desk/podium).
//
// Run with `node tools/gen-chair.mjs` from game2d/; requires the `pngjs`
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

// A simple wooden chair, three-quarter-ish front view (backrest behind a
// low seat, 4 legs) — matches the desk/podium's own scale (cell size 4,
// similar overall footprint) so it reads at the same visual weight.
const CHAIR_COLS = 12;
const CHAIR_ROWS = 14;
const CHAIR_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildChair() {
  const grid = createGrid(CHAIR_COLS, CHAIR_ROWS);

  // Backrest.
  grid.fillRect(1, 0, CHAIR_COLS - 2, 5, WOOD);
  grid.fillRect(1, 0, CHAIR_COLS - 2, 1, WOOD_LIGHT);
  grid.fillRect(3, 1, 2, 3, WOOD_DARK);
  grid.fillRect(CHAIR_COLS - 5, 1, 2, 3, WOOD_DARK);

  // Seat.
  grid.fillRect(0, 5, CHAIR_COLS, 3, WOOD_LIGHT);
  grid.fillRect(0, 7, CHAIR_COLS, 1, WOOD_DARK);

  // Front legs.
  grid.fillRect(0, 8, 2, CHAIR_ROWS - 8, WOOD_DARK);
  grid.fillRect(CHAIR_COLS - 2, 8, 2, CHAIR_ROWS - 8, WOOD_DARK);

  return grid;
}

rasterize(buildChair(), CHAIR_COLS, CHAIR_ROWS, CHAIR_CELL, join(ASSETS_DIR, 'chair.png'));
