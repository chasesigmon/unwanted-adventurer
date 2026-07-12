// Pixel-art generator for the wild imp monster (a follow-up ask: "Create
// an imp spritesheet with walking animations for each direction and punch
// animations for each direction"). Same no-Aseprite/pixel-mcp constraint
// as every other character sheet here (see gen-human-sprites.mjs's own
// header) — a coarse "big pixel" grid rasterized to a real static PNG via
// pngjs, matching the EXISTING character rig exactly (see
// characterSprites.ts): 110x140 frame, 4 rows (down/up/left/right), 8
// cols/row (4 walk frames then 4 punch frames).
//
// A small, squat, bare-bodied green goblin-ish creature with horns and
// pointy ears — no robe (unlike the human wizards), just a loincloth,
// since it's meant to read as a wild pest, not a person.
//
// Run with `node tools/gen-imp-sprites.mjs` from game2d/; requires the
// `pngjs` devDependency (already installed for the other gen-*.mjs
// scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 5; // 22 cols x 28 rows of "big pixels" -> 110x140, matching FRAME_WIDTH/HEIGHT exactly
const COLS = 22;
const ROWS = 28;

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function createGrid() {
  const cells = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < ROWS && xx >= 0 && xx < COLS) cells[yy][xx] = color;
        }
      }
    },
    set(x, y, color) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) cells[y][x] = color;
    },
  };
}

function rasterizeCharacterSheet(frameGrids, outPath) {
  const frameWidth = COLS * CELL;
  const frameHeight = ROWS * CELL;
  const png = new PNG({ width: frameWidth * 8, height: frameHeight * 4 });
  png.data.fill(0);

  const ROW_ORDER = ['down', 'up', 'left', 'right'];
  ROW_ORDER.forEach((facing, rowIdx) => {
    for (let col = 0; col < 8; col++) {
      const grid = frameGrids[facing][col];
      const offsetX = col * frameWidth;
      const offsetY = rowIdx * frameHeight;
      for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
          const color = grid.cells[cy][cx];
          if (!color) continue;
          const { r, g, b } = hex(color);
          for (let py = 0; py < CELL; py++) {
            for (let px = 0; px < CELL; px++) {
              const x = offsetX + cx * CELL + px;
              const y = offsetY + cy * CELL + py;
              const idx = (frameWidth * 8 * y + x) << 2;
              png.data[idx] = r;
              png.data[idx + 1] = g;
              png.data[idx + 2] = b;
              png.data[idx + 3] = 255;
            }
          }
        }
      }
    }
  });

  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${frameWidth * 8}x${frameHeight * 4})`);
}

// ---------- Palette ----------
const SKIN = 0x5a8a3a; // mottled green hide
const SKIN_DARK = 0x3d6626;
const HORN = 0x3a2a1e;
const EYE = 0xd93a1e; // a small glowing red eye
const CLOTH = 0x4a3826; // a scrap loincloth, the only "clothing"

const HEAD_W = 9;
const HEAD_H = 7;
const HEAD_X = Math.round((COLS - HEAD_W) / 2);

// A small, squat build — bare-limbed (unlike the robed humans), so the
// walk cycle needs actual leg movement instead of a swaying hem, plus the
// same opposite-arm-swing/body-bob shape.
const WALK_POSES = [
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: 1, legSwing: 1, bob: -1 },
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: -1, legSwing: -1, bob: -1 },
];

// Same "windup -> mid -> full extend -> recover" punch shape as the
// human generator.
const PUNCH_POSES = [{ extend: -1 }, { extend: 1 }, { extend: 3 }, { extend: 1 }];

function drawFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 5 + bob;
  const neckY = headY + HEAD_H;
  const bodyTop = neckY;
  const bodyBottom = ROWS - 8 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 10;
  const bodyX = HEAD_X + Math.round((HEAD_W - bodyWidth) / 2);

  // Horns — small, curved-back, either side of the head.
  grid.fillRect(HEAD_X - 1, headY - 3, 2, 3, HORN);
  grid.fillRect(HEAD_X + HEAD_W - 1, headY - 3, 2, 3, HORN);

  // Pointy ears poking out the sides.
  grid.fillRect(HEAD_X - 2, headY + 2, 2, 3, SKIN_DARK);
  grid.fillRect(HEAD_X + HEAD_W, headY + 2, 2, 3, SKIN_DARK);

  // Head.
  grid.fillRect(HEAD_X, headY, HEAD_W, HEAD_H, SKIN);
  if (facing === 'down') {
    grid.set(HEAD_X + 2, headY + 3, EYE);
    grid.set(HEAD_X + 6, headY + 3, EYE);
    grid.fillRect(HEAD_X + 3, headY + 5, 3, 1, SKIN_DARK); // a small grin
  } else if (facing === 'left' || facing === 'right') {
    const eyeX = facing === 'left' ? HEAD_X + 2 : HEAD_X + 6;
    grid.set(eyeX, headY + 3, EYE);
  }
  // 'up' shows just the back of the head, no face detail.

  // Squat torso, tapering slightly toward the waist.
  for (let row = 0; row < bodyHeight; row++) {
    const t = row / Math.max(1, bodyHeight - 1);
    const width = Math.round(bodyWidth - t * 2);
    const x = bodyX + Math.round((bodyWidth - width) / 2);
    grid.fillRect(x, bodyTop + row, width, 1, row % 8 < 6 ? SKIN : SKIN_DARK);
  }
  // A scrap loincloth at the waist.
  grid.fillRect(bodyX, bodyBottom - 2, bodyWidth, 3, CLOTH);

  // Legs — short and stubby, swinging opposite each other while walking.
  const legY = bodyBottom + 1;
  const legH = ROWS - legY - Math.max(0, bob);
  const drawLeg = (side, swingOffset) => {
    const x = side === 'left' ? bodyX + 1 : bodyX + bodyWidth - 3;
    const y = legY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 2, legH, SKIN_DARK);
  };
  drawLeg('left', legSwing);
  drawLeg('right', -legSwing);

  // Arms — thin, swinging opposite the legs.
  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 2 : bodyX + bodyWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 2, 6, SKIN);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  // The punching arm/fist — drawn last so it reaches past the silhouette.
  if (extend !== null) {
    const fistY = armY + 3;
    if (facing === 'down') grid.fillRect(HEAD_X + 2, fistY + 4 + extend, 3, 2, SKIN);
    else if (facing === 'up') grid.fillRect(HEAD_X + 2, headY - 1 - extend, 3, 2, SKIN);
    else if (facing === 'left') grid.fillRect(bodyX - 3 - extend, fistY, 3, 2, SKIN);
    else grid.fillRect(bodyX + bodyWidth + extend, fistY, 3, 2, SKIN);
  }
}

function buildFrameSet() {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const pose of WALK_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, armSwing: pose.armSwing, legSwing: pose.legSwing, bob: pose.bob });
      frames[facing].push(grid);
    }
    for (const pose of PUNCH_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, extend: pose.extend });
      frames[facing].push(grid);
    }
  }
  return frames;
}

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'imp-spritesheet.png'));
