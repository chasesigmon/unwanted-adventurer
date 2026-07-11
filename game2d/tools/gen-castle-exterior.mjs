// One-time pixel-art generator for Grimoak Castle's exterior (item 4) and
// a small flying-crow decoration — same constraints/approach as
// tools/gen-shop-assets.mjs and tools/gen-human-sprites.mjs: no Aseprite/
// pixel-mcp available, so this draws on a coarse "big pixel" grid and
// rasterizes a real static PNG via pngjs. The castle itself is one static
// image (a tall central keep flanked by two taller spired towers, lit
// windows, crenellations, a big arched door); "crows flying around the
// tops" is a separate tiny sprite the client tweens in small looping
// paths near the two towers (see WorldScene's renderMap), the same
// "static image + a Phaser tween" pattern already used for swaying trees
// and flickering wall torches — there's no runtime canvas drawing either
// way, just a tween moving/alpha-ing an already-loaded static texture.
//
// Run with `node tools/gen-castle-exterior.mjs` from game2d/; requires
// the `pngjs` devDependency (`npm install --no-save pngjs` if missing).
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

// ---------- Palette ----------
const STONE = 0x6b6459;
const STONE_DARK = 0x4f4a41;
const STONE_LIGHT = 0x807865;
const ROOF = 0x3a2f3f;
const ROOF_DARK = 0x2a2230;
const WINDOW_LIT = 0xf0c060;
const WINDOW_DARK = 0x1a1710;
const DOOR = 0x2a1d12;

const CELL = 6;
const COLS = 64;
const ROWS = 112;

function drawTowerSpire(grid, left, width, roofTopY, roofBaseY) {
  const spireHeight = roofBaseY - roofTopY;
  for (let row = 0; row <= spireHeight; row++) {
    const t = row / spireHeight;
    const halfWidth = Math.round((width / 2) * t);
    const x = left + Math.floor(width / 2) - halfWidth;
    grid.fillRect(x, roofTopY + row, Math.max(1, halfWidth * 2), 1, row % 3 === 0 ? ROOF_DARK : ROOF);
  }
}

function drawWindowGrid(grid, left, width, top, bottom, spacingX, spacingY) {
  for (let y = top; y < bottom - 2; y += spacingY) {
    for (let x = left + 2; x < left + width - 2; x += spacingX) {
      grid.fillRect(x, y, 2, 3, WINDOW_DARK);
      grid.fillRect(x, y, 2, 2, WINDOW_LIT);
    }
  }
}

function drawMasonryLines(grid, left, width, top, bottom) {
  for (let y = top; y < bottom; y += 4) {
    grid.fillRect(left, y, width, 1, STONE_DARK);
  }
}

function buildCastle() {
  const grid = createGrid(COLS, ROWS);

  // ---- Two flanking towers (taller than the keep) ----
  const towerWidth = 14;
  const leftTowerX = 2;
  const rightTowerX = COLS - 2 - towerWidth;
  const towerTop = 6;
  const towerBodyTop = 20;
  const towerBottom = ROWS - 4;

  drawTowerSpire(grid, leftTowerX, towerWidth, towerTop, towerBodyTop);
  drawTowerSpire(grid, rightTowerX, towerWidth, towerTop, towerBodyTop);
  grid.fillRect(leftTowerX, towerBodyTop, towerWidth, towerBottom - towerBodyTop, STONE);
  grid.fillRect(rightTowerX, towerBodyTop, towerWidth, towerBottom - towerBodyTop, STONE);
  drawMasonryLines(grid, leftTowerX, towerWidth, towerBodyTop, towerBottom);
  drawMasonryLines(grid, rightTowerX, towerWidth, towerBodyTop, towerBottom);
  drawWindowGrid(grid, leftTowerX, towerWidth, towerBodyTop + 4, towerBottom, 5, 10);
  drawWindowGrid(grid, rightTowerX, towerWidth, towerBodyTop + 4, towerBottom, 5, 10);
  // Tower base foundation, a shade darker.
  grid.fillRect(leftTowerX - 1, towerBottom, towerWidth + 2, 4, STONE_DARK);
  grid.fillRect(rightTowerX - 1, towerBottom, towerWidth + 2, 4, STONE_DARK);

  // ---- Central keep (shorter than the towers, crenellated top) ----
  const keepLeft = leftTowerX + towerWidth + 2;
  const keepWidth = rightTowerX - keepLeft - 2;
  const keepTop = 34;
  const keepBottom = ROWS - 4;

  // Crenellations — a repeating notch pattern along the top edge.
  for (let x = keepLeft; x < keepLeft + keepWidth; x += 6) {
    grid.fillRect(x, keepTop, 3, 4, STONE);
  }
  grid.fillRect(keepLeft, keepTop + 4, keepWidth, keepBottom - (keepTop + 4), STONE_LIGHT);
  drawMasonryLines(grid, keepLeft, keepWidth, keepTop + 8, keepBottom);
  drawWindowGrid(grid, keepLeft, keepWidth, keepTop + 10, keepBottom, 6, 9);

  // A big arched doorway, centered at the base of the keep — this is
  // where the in-game entrance door tile sits, directly below.
  const doorWidth = 10;
  const doorLeft = keepLeft + Math.floor((keepWidth - doorWidth) / 2);
  const doorTop = keepBottom - 14;
  grid.fillRect(doorLeft - 1, doorTop - 2, doorWidth + 2, 2, STONE_DARK);
  grid.fillRect(doorLeft, doorTop, doorWidth, 14, DOOR);
  // A soft warm glow spilling out of the doorway.
  grid.fillRect(doorLeft + 1, doorTop + 2, doorWidth - 2, 4, WINDOW_LIT);

  // Keep foundation.
  grid.fillRect(keepLeft - 1, keepBottom, keepWidth + 2, 4, STONE_DARK);

  return grid;
}

rasterize(buildCastle(), COLS, ROWS, CELL, join(ASSETS_DIR, 'castle-exterior.png'));

// ---------- A tiny crow silhouette — a single "wings out" frame; flight
// motion comes entirely from a Phaser tween on this static sprite (see
// WorldScene's renderMap), not from frame animation. ----------
const CROW_COLS = 12;
const CROW_ROWS = 8;
const CROW_CELL = 3;
const CROW_BLACK = 0x18140f;

function buildCrow() {
  const grid = createGrid(CROW_COLS, CROW_ROWS);
  // A shallow "M" wing shape plus a small body/head.
  grid.fillRect(0, 3, 3, 1, CROW_BLACK);
  grid.fillRect(2, 2, 2, 1, CROW_BLACK);
  grid.fillRect(4, 3, 1, 1, CROW_BLACK);
  grid.fillRect(5, 3, 2, 2, CROW_BLACK);
  grid.fillRect(7, 3, 1, 1, CROW_BLACK);
  grid.fillRect(8, 2, 2, 1, CROW_BLACK);
  grid.fillRect(9, 3, 3, 1, CROW_BLACK);
  return grid;
}

rasterize(buildCrow(), CROW_COLS, CROW_ROWS, CROW_CELL, join(ASSETS_DIR, 'crow.png'));

// ---------- A room fireplace (item 6) — a stone mantle around a hearth
// with a couple of flame shapes. Like the wall torch, the flame's flicker
// is a Phaser alpha-tween applied to this whole static sprite client-side
// (see WorldScene's renderMap), not a multi-frame animation. ----------
const HEARTH_COLS = 20;
const HEARTH_ROWS = 22;
const HEARTH_CELL = 4;
const MANTLE_STONE = 0x6b6459;
const MANTLE_STONE_DARK = 0x4f4a41;
const HEARTH_BLACK = 0x1a1512;
const FLAME_OUTER = 0xd9601a;
const FLAME_INNER = 0xf0c040;
const LOG = 0x4a3320;

function buildFireplace() {
  const grid = createGrid(HEARTH_COLS, HEARTH_ROWS);

  // Stone mantle surround.
  grid.fillRect(0, 0, HEARTH_COLS, 3, MANTLE_STONE);
  grid.fillRect(0, 0, 3, HEARTH_ROWS, MANTLE_STONE);
  grid.fillRect(HEARTH_COLS - 3, 0, 3, HEARTH_ROWS, MANTLE_STONE);
  grid.fillRect(0, HEARTH_ROWS - 2, HEARTH_COLS, 2, MANTLE_STONE_DARK);
  grid.fillRect(1, 1, HEARTH_COLS - 2, 1, MANTLE_STONE_DARK);

  // Dark hearth interior.
  grid.fillRect(3, 3, HEARTH_COLS - 6, HEARTH_ROWS - 5, HEARTH_BLACK);

  // A couple of logs at the base.
  grid.fillRect(5, HEARTH_ROWS - 6, HEARTH_COLS - 10, 2, LOG);
  grid.fillRect(6, HEARTH_ROWS - 8, HEARTH_COLS - 12, 2, LOG);

  // Flame shapes — a couple of licking-flame silhouettes above the logs.
  const flameBase = HEARTH_ROWS - 7;
  for (const [fx, fw, fh] of [
    [5, 4, 8],
    [9, 5, 10],
    [HEARTH_COLS - 9, 4, 7],
  ]) {
    for (let row = 0; row < fh; row++) {
      const t = row / fh;
      const width = Math.max(1, Math.round(fw * (1 - t * 0.8)));
      const x = fx + Math.floor((fw - width) / 2);
      grid.fillRect(x, flameBase - row, width, 1, row < fh * 0.5 ? FLAME_OUTER : FLAME_INNER);
    }
  }

  return grid;
}

rasterize(buildFireplace(), HEARTH_COLS, HEARTH_ROWS, HEARTH_CELL, join(ASSETS_DIR, 'fireplace.png'));

// ---------- A stairway tile (item 6) — same footprint as the wooden
// door (32x40) so it drops into the exact same doorSprites rendering
// slot, just with a distinct look (ascending stone steps) so a staircase
// reads differently from a door. ----------
const STAIRS_COLS = 8;
const STAIRS_ROWS = 10;
const STAIRS_CELL = 4;
const STAIRS_STONE = 0x8a8272;
const STAIRS_STONE_DARK = 0x625c4f;
const STAIRS_SHADOW = 0x3a362e;

function buildStairs() {
  const grid = createGrid(STAIRS_COLS, STAIRS_ROWS);
  const stepCount = 5;
  const stepHeight = Math.floor(STAIRS_ROWS / stepCount);
  for (let i = 0; i < stepCount; i++) {
    const y = STAIRS_ROWS - (i + 1) * stepHeight;
    const width = STAIRS_COLS - i * 1;
    grid.fillRect(0, y, width, stepHeight, i % 2 === 0 ? STAIRS_STONE : STAIRS_STONE_DARK);
    grid.fillRect(0, y, width, 1, STAIRS_SHADOW);
  }
  return grid;
}

rasterize(buildStairs(), STAIRS_COLS, STAIRS_ROWS, STAIRS_CELL, join(ASSETS_DIR, 'stairs.png'));
