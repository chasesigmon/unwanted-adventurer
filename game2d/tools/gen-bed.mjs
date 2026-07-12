// Pixel-art generator for the Dorms rooms' own beds (a later follow-up
// ask: "5 beds spaced evenly apart"). Same no-Aseprite/pixel-mcp, coarse
// "big pixel" grid rasterized to a real static PNG via pngjs convention
// as every other generator here.
//
// Run with `node tools/gen-bed.mjs` from game2d/; requires the `pngjs`
// devDependency (`npm install --no-save pngjs` if missing).
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

// ---------- A simple wooden-frame bed, viewed from slightly above —
// dark wood frame, a cream mattress, and a small pillow at the head. ----------
const COLS = 16;
const ROWS = 20;
const CELL = 4;
const FRAME = 0x5a3d24;
const FRAME_DARK = 0x3d2818;
const MATTRESS = 0xd8c8a8;
const PILLOW = 0xf0ece0;
const BLANKET = 0x7a2020;

function buildBed() {
  const grid = createGrid(COLS, ROWS);

  // Outer frame.
  grid.fillRect(0, 0, COLS, ROWS, FRAME_DARK);
  grid.fillRect(1, 1, COLS - 2, ROWS - 2, FRAME);

  // Pillow at the head (top).
  grid.fillRect(2, 2, COLS - 4, 4, PILLOW);

  // Mattress + blanket for the rest.
  grid.fillRect(2, 6, COLS - 4, ROWS - 12, MATTRESS);
  grid.fillRect(2, ROWS - 7, COLS - 4, 4, BLANKET);

  // Foot of the frame, a touch darker.
  grid.fillRect(1, ROWS - 3, COLS - 2, 2, FRAME_DARK);

  return grid;
}

rasterize(buildBed(), COLS, ROWS, CELL, join(ASSETS_DIR, 'bed.png'));
