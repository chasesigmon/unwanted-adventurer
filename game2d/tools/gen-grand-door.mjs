// Pixel-art generator for a single, unified door sprite (a follow-up ask:
// "Create a new fancy solid double sided wooden door sprite... replace
// the other door sprites into buildings [ex: all of the existing
// doors]") — a fancy arched double door, replacing BOTH the plain
// door.svg (used for every non-shop map exit) and the wooden-door
// spritesheet (used for shop doors, with its now-unneeded closed/ajar
// frames) with one texture used everywhere a door is rendered.
//
// Same no-Aseprite/pixel-mcp constraint as every other generator here —
// a coarse "big pixel" grid rasterized to a real static PNG via pngjs.
//
// Run with `node tools/gen-grand-door.mjs` from game2d/; requires the
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

const COLS = 24;
const ROWS = 32;
const CELL = 2; // fine detail for a "fancy" look

const STONE_FRAME = 0x6b6459;
const STONE_FRAME_DARK = 0x4f4a41;
const STONE_FRAME_LIGHT = 0x8a8272;
const WOOD = 0x6b4423;
const WOOD_LIGHT = 0x8a5a30;
const WOOD_DARK = 0x4a2f18;
const IRON = 0x555555;
const IRON_DARK = 0x38383a;
const GOLD = 0xc9a24a;
const GOLD_DARK = 0x8a6a2a;
const SEAM_SHADOW = 0x241a10;

function buildGrandDoor() {
  const grid = createGrid(COLS, ROWS);
  const cx = Math.floor(COLS / 2);

  // A softly arched stone frame around the whole door — tapering inward
  // toward the top, same "widen by 1 cell per row" taper the castle
  // towers/podium already use.
  const archRows = 5;
  for (let r = 0; r < archRows; r++) {
    const inset = archRows - r;
    grid.fillRect(inset, r, COLS - inset * 2, 1, r % 2 === 0 ? STONE_FRAME : STONE_FRAME_LIGHT);
  }
  grid.fillRect(0, archRows, 2, ROWS - archRows, STONE_FRAME);
  grid.fillRect(COLS - 2, archRows, 2, ROWS - archRows, STONE_FRAME);
  grid.fillRect(0, ROWS - 2, COLS, 2, STONE_FRAME_DARK);
  // A lighter highlight edge down the frame's inner face.
  grid.fillRect(2, archRows, 1, ROWS - archRows - 2, STONE_FRAME_LIGHT);
  grid.fillRect(COLS - 3, archRows, 1, ROWS - archRows - 2, STONE_FRAME_LIGHT);

  // ---- The two door leaves, filling the space inside the frame ----
  const leafTop = archRows + 1;
  const leafBottom = ROWS - 3;
  const leafHeight = leafBottom - leafTop;
  const innerLeft = 3;
  const innerRight = COLS - 3;
  const seamWidth = 1;
  const leafWidth = Math.floor((innerRight - innerLeft - seamWidth) / 2);

  function drawLeaf(leafLeft, mirrored) {
    grid.fillRect(leafLeft, leafTop, leafWidth, leafHeight, WOOD);
    // Vertical plank seams.
    for (let x = 1; x < leafWidth - 1; x += 2) grid.fillRect(leafLeft + x, leafTop, 1, leafHeight, WOOD_DARK);
    // A raised, lighter panel inset for a "fancy" look — two stacked
    // rectangular panels per leaf, each with a light top-left highlight.
    const panelMarginX = 2;
    const panelWidth = leafWidth - panelMarginX * 2;
    const panelGap = 2;
    const panelHeight = Math.floor((leafHeight - panelGap * 3) / 2);
    for (let i = 0; i < 2; i++) {
      const panelTop = leafTop + panelGap + i * (panelHeight + panelGap);
      grid.fillRect(leafLeft + panelMarginX, panelTop, panelWidth, panelHeight, WOOD_LIGHT);
      grid.fillRect(leafLeft + panelMarginX, panelTop, panelWidth, 1, STONE_FRAME_LIGHT);
      grid.fillRect(leafLeft + panelMarginX, panelTop + panelHeight - 1, panelWidth, 1, SEAM_SHADOW);
    }
    // Iron corner reinforcement straps, top and bottom.
    grid.fillRect(leafLeft, leafTop, leafWidth, 1, IRON);
    grid.fillRect(leafLeft, leafTop + 1, leafWidth, 1, IRON_DARK);
    grid.fillRect(leafLeft, leafBottom - 2, leafWidth, 1, IRON);
    grid.fillRect(leafLeft, leafBottom - 1, leafWidth, 1, IRON_DARK);
    // A gold handle ring near the inner (center-seam) edge.
    const ringX = mirrored ? leafLeft + 1 : leafLeft + leafWidth - 2;
    const ringY = leafTop + Math.floor(leafHeight / 2);
    grid.set(ringX, ringY, GOLD);
    grid.set(ringX, ringY + 1, GOLD_DARK);
  }

  drawLeaf(innerLeft, false);
  drawLeaf(innerLeft + leafWidth + seamWidth, true);

  // The center seam itself — a dark dividing shadow where the two leaves meet.
  grid.fillRect(innerLeft + leafWidth, leafTop, seamWidth, leafHeight, SEAM_SHADOW);

  // Stone threshold along the very bottom.
  grid.fillRect(0, ROWS - 1, COLS, 1, STONE_FRAME_DARK);

  return grid;
}

rasterize(buildGrandDoor(), COLS, ROWS, CELL, join(ASSETS_DIR, 'grand-door.png'));
