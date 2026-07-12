// Pixel-art generator for the secret room's treasure chest (a later
// follow-up ask: "a treasure chest in the center... should be clickable").
// Same no-Aseprite/pixel-mcp, coarse "big pixel" grid rasterized to a
// real static PNG via pngjs convention as every other generator here.
//
// Run with `node tools/gen-chest.mjs` from game2d/; requires the
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

// ---------- The secret room's treasure chest — a squat wooden chest
// banded with iron and a domed lid, with a locked/unlocked variant
// (client picks by frame index: 0 = locked, 1 = unlocked) so the
// per-player lock state (see shared/types.ts's secretChestUnlocked) has
// a visible tell. ----------
const CHEST_COLS = 20;
const CHEST_ROWS = 16;
const CHEST_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;
const IRON = 0x8a8a92;
const IRON_DARK = 0x5a5a62;
const GOLD = 0xd4af37;
const LOCK_BODY = 0x3a3a42;

function buildChest(locked) {
  const grid = createGrid(CHEST_COLS, CHEST_ROWS);

  // Domed lid.
  grid.fillRect(2, 2, CHEST_COLS - 4, 4, WOOD_LIGHT);
  grid.fillRect(1, 4, CHEST_COLS - 2, 2, WOOD);
  grid.fillRect(1, 5, CHEST_COLS - 2, 1, WOOD_DARK);

  // Body.
  grid.fillRect(1, 6, CHEST_COLS - 2, CHEST_ROWS - 8, WOOD);
  grid.fillRect(1, CHEST_ROWS - 3, CHEST_COLS - 2, 1, WOOD_DARK);

  // Iron bands (front + edges).
  grid.fillRect(1, 2, 2, CHEST_ROWS - 4, IRON_DARK);
  grid.fillRect(CHEST_COLS - 3, 2, 2, CHEST_ROWS - 4, IRON_DARK);
  grid.fillRect(3, 8, CHEST_COLS - 6, 1, IRON);

  // Base.
  grid.fillRect(0, CHEST_ROWS - 2, CHEST_COLS, 2, WOOD_DARK);

  // Front-and-center lock plate, colored by lock state (a follow-up ask:
  // "the treasure chest should be locked also and needs to first be
  // unlocked") — dark iron+shackle while locked, plain gold clasp once
  // resera'd open.
  const midCol = Math.floor(CHEST_COLS / 2);
  if (locked) {
    grid.fillRect(midCol - 2, 6, 4, 3, LOCK_BODY);
    grid.fillRect(midCol - 1, 5, 2, 2, IRON);
  } else {
    grid.fillRect(midCol - 2, 7, 4, 2, GOLD);
  }

  return grid;
}

rasterize(buildChest(true), CHEST_COLS, CHEST_ROWS, CHEST_CELL, join(ASSETS_DIR, 'chest-locked.png'));
rasterize(buildChest(false), CHEST_COLS, CHEST_ROWS, CHEST_CELL, join(ASSETS_DIR, 'chest-unlocked.png'));
