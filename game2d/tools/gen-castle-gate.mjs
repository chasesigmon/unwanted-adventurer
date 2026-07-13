// Pixel-art generator for the Grimoak Grounds' own castle gate (a follow-
// up ask: "add a large double metal gate/fence on the other side of the
// bridge... it should open magically with each gate parting"). A single
// LEAF texture — the right-hand leaf is just this same texture rendered
// with Phaser's own horizontal flip (setFlipX), no separate mirrored art
// needed, same "one texture, flip for the other side" shape gen-bench.mjs
// uses for its own rotated instances.
//
// Same no-Aseprite/pixel-mcp constraint as every other generator here —
// a coarse "big pixel" grid rasterized to a real static PNG via pngjs.
//
// Run with `node tools/gen-castle-gate.mjs` from game2d/; requires the
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
    set(x, y, color) {
      if (y >= 0 && y < rows && x >= 0 && x < cols) cells[y][x] = color;
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

// A tall wrought-iron gate leaf — vertical bars between a top and bottom
// rail, a decorative spiked finial row along the top, and a stone post
// down its own outer (hinge) edge.
const COLS = 20;
const ROWS = 24;
const CELL = 4;

const IRON = 0x3a3a40;
const IRON_DARK = 0x24242a;
const IRON_LIGHT = 0x5c5c66;
const GOLD = 0xc9a24a;
const GOLD_DARK = 0x8a6a2a;
const STONE = 0x6b6459;
const STONE_DARK = 0x4f4a41;

function buildGateLeaf() {
  const grid = createGrid(COLS, ROWS);

  // A stone gatepost down the outer (left) edge — this side stays fixed
  // in place; only the barred leaf itself slides when the gate opens (see
  // WorldScene's own gate-leaf sprite, which excludes this post's own
  // width from its tween distance).
  const postWidth = 3;
  grid.fillRect(0, 0, postWidth, ROWS, STONE);
  grid.fillRect(0, 0, postWidth, 2, STONE_DARK);
  grid.fillRect(1, 2, 1, ROWS - 4, STONE_DARK);
  grid.fillRect(0, ROWS - 2, postWidth, 2, STONE_DARK);

  // Top and bottom rails spanning the barred section.
  const barsLeft = postWidth + 1;
  const barsRight = COLS;
  grid.fillRect(barsLeft, 3, barsRight - barsLeft, 2, IRON);
  grid.fillRect(barsLeft, 3, barsRight - barsLeft, 1, IRON_LIGHT);
  grid.fillRect(barsLeft, ROWS - 4, barsRight - barsLeft, 2, IRON);

  // Vertical bars, alternating a lighter highlight down one edge of each.
  for (let x = barsLeft; x < barsRight - 1; x += 2) {
    grid.fillRect(x, 5, 1, ROWS - 9, IRON);
    grid.fillRect(x + 1, 5, 1, ROWS - 9, IRON_DARK);
  }

  // Decorative spiked finials poking above the top rail.
  for (let x = barsLeft; x < barsRight - 1; x += 2) {
    grid.set(x, 2, IRON_LIGHT);
    grid.set(x, 1, IRON);
  }

  // A gold crest medallion where the two leaves would meet (only visible
  // on the inner edge — harmless if slightly clipped by the neighboring
  // leaf when closed).
  const crestX = barsRight - 2;
  const crestY = Math.floor(ROWS / 2);
  grid.fillRect(crestX - 1, crestY - 1, 2, 2, GOLD);
  grid.set(crestX - 1, crestY - 2, GOLD_DARK);

  return grid;
}

rasterize(buildGateLeaf(), COLS, ROWS, CELL, join(ASSETS_DIR, 'castle-gate-leaf.png'));
