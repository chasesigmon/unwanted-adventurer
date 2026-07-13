// Pixel-art generator for the Great Hall's own long banquet table (a
// follow-up ask: "add a long wooden table sprite in the center of the
// Great Hall that stretches horizontally for about half of the room").
// Drawn top-down, sized to match the table's own server-side footprint
// (see shared/lighting.ts's greatHallTableFootprint: half the Great
// Hall's own column count, 2 tiles deep) at this project's TILE_SIZE
// (32px/tile, src/game/mapRender.ts) and the same 4px "big pixel" cell
// every other simple furniture piece here uses.
//
// Run with `node tools/gen-long-table.mjs` from game2d/; requires the
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

// 20 tiles wide x 2 tiles deep at 8 cells/tile (TILE_SIZE 32 / CELL 4).
const TABLE_COLS = 160;
const TABLE_ROWS = 16;
const TABLE_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildLongTable() {
  const grid = createGrid(TABLE_COLS, TABLE_ROWS);

  // Tabletop.
  grid.fillRect(0, 2, TABLE_COLS, 10, WOOD_LIGHT);
  grid.fillRect(0, 2, TABLE_COLS, 1, WOOD);
  grid.fillRect(0, 11, TABLE_COLS, 1, WOOD_DARK);

  // Legs, evenly spaced along the length.
  for (let x = 4; x < TABLE_COLS - 4; x += 16) {
    grid.fillRect(x, 12, 3, 4, WOOD_DARK);
  }

  return grid;
}

rasterize(buildLongTable(), TABLE_COLS, TABLE_ROWS, TABLE_CELL, join(ASSETS_DIR, 'long-table.png'));
