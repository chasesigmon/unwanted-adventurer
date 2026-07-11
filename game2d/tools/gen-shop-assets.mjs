// One-time pixel-art generator for the Floro shop building + wooden door
// spritesheets (items 11/12) — no Aseprite install or pixel-mcp
// configuration is available in this environment, so this hand-rolled
// generator draws each sprite on a coarse "big pixel" grid (each cell a
// solid 4x4px block, matching a classic 16-bit tile-art look) and
// rasterizes it with pngjs into a real static PNG under game2d/assets/,
// the same kind of real image asset the game's other spritesheets are —
// NOT a runtime canvas-draw path (nothing in this file ships to the
// browser; the client only ever loads the resulting .png through
// Phaser's ordinary spritesheet loader, same as any hand-drawn asset).
//
// Run once with `node tools/gen-shop-assets.mjs` from game2d/ whenever
// the art needs regenerating; requires the `pngjs` devDependency
// (`npm install --no-save pngjs` if it's not already present).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 4; // each "big pixel" is a 4x4 real-pixel block

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// A tiny drawing surface addressed in COARSE cells (colsCells x rowsCells)
// — filled in as a 2D array of colors (or null for transparent), then
// rasterized to real pixels at the very end.
function createGrid(colsCells, rowsCells) {
  const cells = Array.from({ length: rowsCells }, () => new Array(colsCells).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < rowsCells && xx >= 0 && xx < colsCells) cells[yy][xx] = color;
        }
      }
    },
    set(x, y, color) {
      if (y >= 0 && y < rowsCells && x >= 0 && x < colsCells) cells[y][x] = color;
    },
  };
}

function mirrorGridHorizontally(grid, colsCells, rowsCells) {
  const mirrored = createGrid(colsCells, rowsCells);
  for (let y = 0; y < rowsCells; y++) {
    for (let x = 0; x < colsCells; x++) {
      mirrored.cells[y][x] = grid.cells[y][colsCells - 1 - x];
    }
  }
  return mirrored;
}

// Rasterizes a list of same-size coarse grids side by side into one PNG
// spritesheet, each grid becoming one frame.
function rasterizeSpritesheet(grids, colsCells, rowsCells, outPath) {
  const frameWidth = colsCells * CELL;
  const frameHeight = rowsCells * CELL;
  const png = new PNG({ width: frameWidth * grids.length, height: frameHeight });
  png.data.fill(0); // fully transparent background (alpha channel left at 0 below)

  grids.forEach((grid, frameIndex) => {
    const offsetX = frameIndex * frameWidth;
    for (let cy = 0; cy < rowsCells; cy++) {
      for (let cx = 0; cx < colsCells; cx++) {
        const color = grid.cells[cy][cx];
        if (!color) continue;
        const { r, g, b } = hex(color);
        for (let py = 0; py < CELL; py++) {
          for (let px = 0; px < CELL; px++) {
            const x = offsetX + cx * CELL + px;
            const y = cy * CELL + py;
            const idx = (frameWidth * grids.length * y + x) << 2;
            png.data[idx] = r;
            png.data[idx + 1] = g;
            png.data[idx + 2] = b;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  });

  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${frameWidth * grids.length}x${frameHeight}, ${grids.length} frame(s) of ${frameWidth}x${frameHeight})`);
}

// ---------- Shop building (item 11) — a timber-and-plaster two-story
// shopfront: gabled shingle roof, cross-braced plaster wall, one window,
// a hanging sign, a stone foundation, and a door offset to one side (so
// mirroring it produces a genuinely different-reading building instead
// of a perfectly symmetric one). ----------

const BUILDING_COLS = 24;
const BUILDING_ROWS = 28;

const ROOF_DARK = 0x5c2a2a;
const ROOF_LIGHT = 0x7a3a3a;
const WALL_PLASTER = 0xe8dcc0;
const WALL_TIMBER = 0x4a3423;
const DOOR_WOOD = 0x5a3a1e;
const DOOR_FRAME = 0x2f1d0f;
const WINDOW_GLASS = 0x6fa8d4;
const WINDOW_FRAME = 0xf5efe0;
const SIGN_WOOD = 0xc9a15c;
const SIGN_BORDER = 0x6b4423;
const FOUNDATION = 0x8a8a8a;
const FOUNDATION_DARK = 0x6f6f6f;

function buildShopBuildingFrame() {
  const grid = createGrid(BUILDING_COLS, BUILDING_ROWS);

  // Gabled roof — a triangle narrowing upward, rows 0-6.
  for (let r = 0; r <= 6; r++) {
    const half = r; // widens by 1 cell per row going down
    const left = 11 - half;
    const width = half * 2 + 2;
    grid.fillRect(left, r, width, 1, r % 2 === 0 ? ROOF_DARK : ROOF_LIGHT);
  }
  // Roof eaves overhang slightly past the wall on row 6-7.
  grid.fillRect(1, 7, BUILDING_COLS - 2, 1, ROOF_DARK);

  // Plaster wall body, rows 8-23, cols 2-21.
  grid.fillRect(2, 8, 20, 16, WALL_PLASTER);

  // Cross-braced timber framing — corner posts, a mid horizontal beam,
  // and two diagonal braces meeting at the center, all a dark timber tone.
  grid.fillRect(2, 8, 1, 16, WALL_TIMBER);
  grid.fillRect(21, 8, 1, 16, WALL_TIMBER);
  grid.fillRect(2, 15, 20, 1, WALL_TIMBER);
  for (let i = 0; i < 8; i++) {
    grid.set(3 + i, 9 + i, WALL_TIMBER);
    grid.set(20 - i, 9 + i, WALL_TIMBER);
  }

  // Window — upper-left area of the wall.
  grid.fillRect(4, 10, 4, 4, WINDOW_FRAME);
  grid.fillRect(5, 11, 2, 2, WINDOW_GLASS);
  grid.set(5, 12, WINDOW_FRAME);
  grid.set(6, 11, WINDOW_FRAME);

  // Hanging sign above the door, offset to the right (matching the door
  // below it) — a small board on two short brackets.
  grid.fillRect(14, 15, 6, 3, SIGN_WOOD);
  grid.fillRect(14, 15, 6, 1, SIGN_BORDER);
  grid.fillRect(14, 17, 6, 1, SIGN_BORDER);
  grid.set(15, 14, WALL_TIMBER);
  grid.set(18, 14, WALL_TIMBER);

  // Door — offset toward the right side of the building (this frame is
  // "facing right"; mirrorGridHorizontally below produces "facing left").
  grid.fillRect(14, 18, 6, 6, DOOR_FRAME);
  grid.fillRect(15, 19, 4, 5, DOOR_WOOD);
  grid.set(18, 21, DOOR_FRAME); // doorknob

  // Stone foundation strip along the bottom.
  grid.fillRect(1, 24, BUILDING_COLS - 2, 2, FOUNDATION);
  for (let x = 1; x < BUILDING_COLS - 1; x += 3) grid.set(x, 25, FOUNDATION_DARK);
  grid.fillRect(1, 26, BUILDING_COLS - 2, 2, FOUNDATION_DARK);

  return grid;
}

// ---------- Wooden door (item 12) — a standalone reinforced plank door
// used as every shop's entrance, 2 frames (closed / ajar) on one sheet.
// ----------

const DOOR_COLS = 8;
const DOOR_ROWS = 10;

const PLANK_LIGHT = 0x6b4423;
const PLANK_DARK = 0x4a2f18;
const IRON_BAND = 0x555555;
const IRON_BAND_DARK = 0x3a3a3a;
const OUTER_FRAME = 0x2f1d0f;
const AJAR_SHADOW = 0x1a0f08;

function buildDoorFrame(ajar) {
  const grid = createGrid(DOOR_COLS, DOOR_ROWS);
  grid.fillRect(0, 0, DOOR_COLS, DOOR_ROWS, OUTER_FRAME);
  grid.fillRect(1, 1, DOOR_COLS - 2, DOOR_ROWS - 2, PLANK_LIGHT);
  // Vertical plank seams.
  for (let x = 2; x < DOOR_COLS - 1; x += 2) grid.fillRect(x, 1, 1, DOOR_ROWS - 2, PLANK_DARK);
  // Iron reinforcement bands.
  grid.fillRect(1, 2, DOOR_COLS - 2, 1, IRON_BAND);
  grid.fillRect(1, 2, DOOR_COLS - 2, 1, IRON_BAND);
  grid.fillRect(1, 7, DOOR_COLS - 2, 1, IRON_BAND);
  grid.set(1, 3, IRON_BAND_DARK);
  grid.set(1, 8, IRON_BAND_DARK);
  // Doorknob.
  grid.set(DOOR_COLS - 2, Math.floor(DOOR_ROWS / 2), OUTER_FRAME);

  if (ajar) {
    // A dark sliver down the hinge edge suggests the door standing
    // slightly open rather than flush shut.
    grid.fillRect(0, 0, 1, DOOR_ROWS, AJAR_SHADOW);
    grid.fillRect(1, 0, 1, DOOR_ROWS, PLANK_DARK);
  }

  return grid;
}

// ---------- Generate + write both spritesheets ----------

const facingRight = buildShopBuildingFrame();
const facingLeft = mirrorGridHorizontally(facingRight, BUILDING_COLS, BUILDING_ROWS);
rasterizeSpritesheet([facingRight, facingLeft], BUILDING_COLS, BUILDING_ROWS, join(ASSETS_DIR, 'shop-building-spritesheet.png'));

const doorClosed = buildDoorFrame(false);
const doorAjar = buildDoorFrame(true);
rasterizeSpritesheet([doorClosed, doorAjar], DOOR_COLS, DOOR_ROWS, join(ASSETS_DIR, 'wooden-door-spritesheet.png'));
