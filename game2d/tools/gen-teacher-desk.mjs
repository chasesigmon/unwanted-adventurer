// Pixel-art generator for the classroom teacher NPC and its desk (a
// follow-up ask: "Add teacher NPCs to each classroom, behind a desk with
// collision for both"). Same no-Aseprite/pixel-mcp constraint as every
// other generator here — a coarse "big pixel" grid rasterized to a real
// static PNG via pngjs.
//
// The teacher is a stationary NPC (see server/worlds/teachers.ts) that
// never walks or attacks, so unlike the playable races/monsters it only
// ever needs ONE frame actually rendered (idleFrameFor picks row 0 col 0,
// "down" facing) — but characterSprites.ts's preload/anim-creation loops
// over every SpriteKind uniformly and expect the same 4-row x 8-col,
// 110x140-per-frame sheet shape (see FRAME_WIDTH/FRAME_HEIGHT), so this
// still produces a full sheet, just with the same single robed-figure
// frame repeated everywhere instead of a real walk/punch cycle.
//
// Run with `node tools/gen-teacher-desk.mjs` from game2d/; requires the
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

// ---------- Teacher spritesheet — one robed-figure frame stamped into
// every one of the 4x8 slots the generic character-sprite system expects
// (see the file header) ----------
const FRAME_WIDTH = 110;
const FRAME_HEIGHT = 140;
const ROWS_IN_SHEET = 4;
const COLS_IN_SHEET = 8;

const ROBE = 0x3a3a5c;
const ROBE_DARK = 0x28283f;
const ROBE_TRIM = 0x8a7a3a;
const SKIN = 0xd8a878;
const HAT = 0x2a2a45;
const HAT_TRIM = 0x8a7a3a;
const BOOK_COVER = 0x6b3a2a;
const BOOK_PAGE = 0xe8dcc0;

function drawTeacherFrame(png, frameX, frameY) {
  const grid = createGrid(FRAME_WIDTH, FRAME_HEIGHT);
  const cx = Math.floor(FRAME_WIDTH / 2);

  // Pointed wizard hat.
  const hatBaseY = 18;
  for (let row = 0; row < 22; row++) {
    const t = row / 22;
    const halfWidth = Math.round(26 * (1 - t));
    grid.fillRect(cx - halfWidth, hatBaseY - 22 + row, Math.max(1, halfWidth * 2), 2, HAT);
  }
  grid.fillRect(cx - 30, hatBaseY, 60, 6, HAT);
  grid.fillRect(cx - 30, hatBaseY + 6, 60, 3, HAT_TRIM);

  // Head.
  grid.fillRect(cx - 16, hatBaseY + 9, 32, 26, SKIN);

  // Robe body, floor-length.
  const robeTop = hatBaseY + 35;
  for (let row = 0; row < 70; row++) {
    const t = row / 70;
    const halfWidth = Math.round(28 + t * 20);
    grid.fillRect(cx - halfWidth, robeTop + row, halfWidth * 2, 2, row % 10 < 8 ? ROBE : ROBE_DARK);
  }
  // A trim line down the front and along the hem.
  grid.fillRect(cx - 2, robeTop, 4, 70, ROBE_TRIM);
  grid.fillRect(cx - 48, robeTop + 66, 96, 4, ROBE_TRIM);

  // Simple hands holding a small book at the waist.
  const handY = robeTop + 30;
  grid.fillRect(cx - 20, handY, 10, 8, SKIN);
  grid.fillRect(cx + 10, handY, 10, 8, SKIN);
  grid.fillRect(cx - 10, handY - 2, 20, 12, BOOK_COVER);
  grid.fillRect(cx - 7, handY, 14, 8, BOOK_PAGE);

  for (let cy = 0; cy < FRAME_HEIGHT; cy++) {
    for (let cxp = 0; cxp < FRAME_WIDTH; cxp++) {
      const color = grid.cells[cy][cxp];
      if (!color) continue;
      const { r, g, b } = hex(color);
      const x = frameX + cxp;
      const y = frameY + cy;
      const idx = (COLS_IN_SHEET * FRAME_WIDTH * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
}

function buildTeacherSheet() {
  const png = new PNG({ width: COLS_IN_SHEET * FRAME_WIDTH, height: ROWS_IN_SHEET * FRAME_HEIGHT });
  png.data.fill(0);
  for (let row = 0; row < ROWS_IN_SHEET; row++) {
    for (let col = 0; col < COLS_IN_SHEET; col++) {
      drawTeacherFrame(png, col * FRAME_WIDTH, row * FRAME_HEIGHT);
    }
  }
  writeFileSync(join(ASSETS_DIR, 'teacher-spritesheet.png'), PNG.sync.write(png));
  console.log(`Wrote ${join(ASSETS_DIR, 'teacher-spritesheet.png')} (${COLS_IN_SHEET * FRAME_WIDTH}x${ROWS_IN_SHEET * FRAME_HEIGHT})`);
}

buildTeacherSheet();

// ---------- A classroom desk — furniture the teacher stands behind,
// collidable (unlike the shopfront decoration vendors use) ----------
const DESK_COLS = 22;
const DESK_ROWS = 14;
const DESK_CELL = 4;
const WOOD = 0x6b4a2a;
const WOOD_DARK = 0x4a3018;
const WOOD_LIGHT = 0x8a6238;

function buildDesk() {
  const grid = createGrid(DESK_COLS, DESK_ROWS);

  // Tabletop.
  grid.fillRect(0, 0, DESK_COLS, 4, WOOD_LIGHT);
  grid.fillRect(0, 3, DESK_COLS, 1, WOOD_DARK);

  // Front panel.
  grid.fillRect(1, 4, DESK_COLS - 2, 8, WOOD);
  grid.fillRect(1, 4, DESK_COLS - 2, 1, WOOD_DARK);

  // Legs.
  grid.fillRect(1, 11, 3, 3, WOOD_DARK);
  grid.fillRect(DESK_COLS - 4, 11, 3, 3, WOOD_DARK);

  return grid;
}

rasterize(buildDesk(), DESK_COLS, DESK_ROWS, DESK_CELL, join(ASSETS_DIR, 'classroom-desk.png'));

// ---------- The Utilization classroom's spellbook podium (item 8) — a
// wooden lectern with an open book on top, clickable in-game to roll a
// 10% chance of learning lucem (see game.gateway.ts's
// handleReadLucemBook). ----------
const PODIUM_COLS = 16;
const PODIUM_ROWS = 18;
const PODIUM_CELL = 4;
const PODIUM_WOOD = 0x5a3d24;
const PODIUM_WOOD_DARK = 0x3d2818;
const PAGE = 0xe8dcc0;
const PAGE_LINE = 0xb8a888;
const COVER = 0x7a2020;

function buildPodium() {
  const grid = createGrid(PODIUM_COLS, PODIUM_ROWS);

  // Slanted lectern top.
  grid.fillRect(1, 4, PODIUM_COLS - 2, 3, PODIUM_WOOD);
  grid.fillRect(1, 6, PODIUM_COLS - 2, 1, PODIUM_WOOD_DARK);

  // Open book on top.
  grid.fillRect(2, 2, 5, 3, COVER);
  grid.fillRect(PODIUM_COLS - 7, 2, 5, 3, COVER);
  grid.fillRect(3, 1, 4, 3, PAGE);
  grid.fillRect(PODIUM_COLS - 7, 1, 4, 3, PAGE);
  grid.fillRect(4, 2, 2, 1, PAGE_LINE);
  grid.fillRect(PODIUM_COLS - 6, 2, 2, 1, PAGE_LINE);

  // Post + base.
  grid.fillRect(Math.floor(PODIUM_COLS / 2) - 2, 7, 4, PODIUM_ROWS - 10, PODIUM_WOOD);
  grid.fillRect(2, PODIUM_ROWS - 3, PODIUM_COLS - 4, 3, PODIUM_WOOD_DARK);

  return grid;
}

rasterize(buildPodium(), PODIUM_COLS, PODIUM_ROWS, PODIUM_CELL, join(ASSETS_DIR, 'spellbook-podium.png'));
