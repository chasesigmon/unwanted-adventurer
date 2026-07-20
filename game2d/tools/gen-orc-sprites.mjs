// Pixel-art generator for the Labyrinth's level-30 orc monster (a later
// follow-up ask: "add level 30 orcs that roam around the labyrinth").
// Same no-Aseprite/pixel-mcp constraint as every other character sheet
// here (see gen-imp-sprites.mjs's own header) — a coarse "big pixel" grid
// rasterized to a real static PNG via pngjs, matching the EXISTING
// character rig exactly (see characterSprites.ts): 110x140 frame, 4 rows
// (down/up/left/right), 8 cols/row (4 walk frames then 4 punch frames).
//
// A large, hulking green-skinned brute — broader and taller than the
// imp's own squat build, with jutting lower tusks and a dark
// leather/chainmail harness across the torso, reading as a serious
// higher-level threat rather than a wild pest.
//
// Run with `node tools/gen-orc-sprites.mjs` from game2d/; requires the
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
const SKIN = 0x5e6e3a; // dull olive-green hide, darker/greyer than the imp's brighter green
const SKIN_DARK = 0x3f4a26;
const TUSK = 0xe8e0c8;
const EYE = 0xd9a01e; // a small glowing amber eye
const HARNESS = 0x4a4438; // dark leather/chainmail harness across the torso
const HARNESS_DARK = 0x2e2a22;
const WEAPON = 0x6b6659; // a stone/iron club head

const HEAD_W = 10;
const HEAD_H = 8;
const HEAD_X = Math.round((COLS - HEAD_W) / 2);

// A heavier, broader build than the imp — a slower, more deliberate
// stomping gait rather than a scurry.
const WALK_POSES = [
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: 1, legSwing: 1, bob: -1 },
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: -1, legSwing: -1, bob: -1 },
];

// Same "windup -> mid -> full extend -> recover" punch shape as the
// imp/human generators, just swung by a much bigger fist.
const PUNCH_POSES = [{ extend: -1 }, { extend: 1 }, { extend: 3 }, { extend: 1 }];

function drawFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 4 + bob;
  const neckY = headY + HEAD_H;
  const bodyTop = neckY;
  const bodyBottom = ROWS - 7 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 14;
  const bodyX = HEAD_X + Math.round((HEAD_W - bodyWidth) / 2);

  // Head — broader and squarer than the imp's, no horns, just a heavy brow.
  grid.fillRect(HEAD_X, headY, HEAD_W, HEAD_H, SKIN);
  grid.fillRect(HEAD_X - 1, headY + 1, HEAD_W + 2, 2, SKIN_DARK); // heavy brow ridge
  if (facing === 'down') {
    grid.set(HEAD_X + 2, headY + 4, EYE);
    grid.set(HEAD_X + 7, headY + 4, EYE);
    // Jutting lower tusks, either side of the jaw.
    grid.fillRect(HEAD_X + 1, headY + HEAD_H - 1, 2, 2, TUSK);
    grid.fillRect(HEAD_X + HEAD_W - 3, headY + HEAD_H - 1, 2, 2, TUSK);
  } else if (facing === 'left' || facing === 'right') {
    const eyeX = facing === 'left' ? HEAD_X + 2 : HEAD_X + 7;
    grid.set(eyeX, headY + 4, EYE);
    const tuskX = facing === 'left' ? HEAD_X : HEAD_X + HEAD_W - 2;
    grid.fillRect(tuskX, headY + HEAD_H - 1, 2, 2, TUSK);
  }
  // 'up' shows just the back of the head, no face detail.

  // Broad, heavily-built torso, tapering only slightly toward the waist.
  for (let row = 0; row < bodyHeight; row++) {
    const t = row / Math.max(1, bodyHeight - 1);
    const width = Math.round(bodyWidth - t * 3);
    const x = bodyX + Math.round((bodyWidth - width) / 2);
    grid.fillRect(x, bodyTop + row, width, 1, row % 6 < 4 ? SKIN : SKIN_DARK);
  }
  // A dark leather/chainmail harness strapped across the chest.
  grid.fillRect(bodyX + 1, bodyTop + 2, bodyWidth - 2, 3, HARNESS);
  grid.fillRect(bodyX + Math.round(bodyWidth / 2) - 1, bodyTop + 2, 2, bodyHeight - 4, HARNESS_DARK);
  grid.fillRect(bodyX, bodyBottom - 3, bodyWidth, 3, HARNESS_DARK); // a belt at the waist

  // Legs — thick and sturdy, swinging opposite each other while walking.
  const legY = bodyBottom + 1;
  const legH = ROWS - legY - Math.max(0, bob);
  const drawLeg = (side, swingOffset) => {
    const x = side === 'left' ? bodyX + 1 : bodyX + bodyWidth - 4;
    const y = legY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, legH, SKIN_DARK);
  };
  drawLeg('left', legSwing);
  drawLeg('right', -legSwing);

  // Arms — thick, swinging opposite the legs.
  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 3 : bodyX + bodyWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, 8, SKIN);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  // The punching arm/fist, with a stone club head riding along on the
  // down-facing frame for flavor — drawn last so it reaches past the
  // silhouette, same shape every other generator's punch overlay uses.
  if (extend !== null) {
    const fistY = armY + 4;
    if (facing === 'down') {
      grid.fillRect(HEAD_X + 2, fistY + 5 + extend, 4, 3, SKIN);
      grid.fillRect(HEAD_X + 1, fistY + 3 + extend, 6, 3, WEAPON);
    } else if (facing === 'up') {
      grid.fillRect(HEAD_X + 2, headY - 1 - extend, 4, 3, SKIN);
    } else if (facing === 'left') {
      grid.fillRect(bodyX - 4 - extend, fistY, 4, 3, SKIN);
    } else {
      grid.fillRect(bodyX + bodyWidth + extend, fistY, 4, 3, SKIN);
    }
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

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'orc-spritesheet.png'));
