// Pixel-art generator for murus lapideus's own summoned stone block (a
// later follow-up ask: "a stone block with eyes"). Same no-Aseprite/
// pixel-mcp, coarse "big pixel" grid rasterized to a real static PNG via
// pngjs convention as every other generator here.
//
// Run with `node tools/gen-stone-block.mjs` from game2d/; requires the
// `pngjs` devDependency (`npm install --no-save pngjs` if missing).
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

// ---------- Murus lapideus's own stone block — roughly player-sized,
// squat and boulder-like, with two small cartoon eyes so it reads as a
// living decoy rather than plain scenery. ----------
const COLS = 18;
const ROWS = 16;
const CELL = 4;
const STONE = 0x8a8a86;
const STONE_DARK = 0x5e5e5a;
const STONE_LIGHT = 0xaaaaa4;
const EYE_WHITE = 0xf0ece0;
const EYE_PUPIL = 0x2a2a2a;

function buildStoneBlock() {
  const grid = createGrid(COLS, ROWS);

  // A rough, slightly irregular boulder silhouette.
  grid.fillRect(2, 2, COLS - 4, 2, STONE_DARK);
  grid.fillRect(1, 4, COLS - 2, ROWS - 6, STONE);
  grid.fillRect(2, ROWS - 2, COLS - 4, 2, STONE_DARK);

  // A few lighter facets for texture/depth.
  grid.fillRect(3, 5, 4, 3, STONE_LIGHT);
  grid.fillRect(COLS - 7, 8, 4, 3, STONE_LIGHT);
  grid.fillRect(6, ROWS - 6, 5, 2, STONE_DARK);

  // Two eyes, front and center.
  const eyeRow = 8;
  grid.fillRect(5, eyeRow, 3, 3, EYE_WHITE);
  grid.fillRect(COLS - 8, eyeRow, 3, 3, EYE_WHITE);
  grid.fillRect(6, eyeRow + 1, 1, 1, EYE_PUPIL);
  grid.fillRect(COLS - 7, eyeRow + 1, 1, 1, EYE_PUPIL);

  return grid;
}

rasterize(buildStoneBlock(), COLS, ROWS, CELL, join(ASSETS_DIR, 'stone-block.png'));
