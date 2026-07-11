// One-time pixel-art generator for the human male/female spritesheets
// (item 3) — no Aseprite install or pixel-mcp configuration is available
// in this environment (same constraint as tools/gen-shop-assets.mjs), so
// this hand-rolled generator draws each frame on a coarse "big pixel"
// grid and rasterizes it with pngjs into real static PNGs under
// game2d/assets/ — NOT a runtime canvas-draw path; the client only ever
// loads the resulting .png through Phaser's ordinary spritesheet loader.
//
// Matches the EXISTING character rig exactly (see characterSprites.ts):
// 110x140 frame, 4 rows (down/up/left/right), 8 cols/row (4 walk frames
// then 4 punch frames). Drawn as a robed figure — thematically fits a
// wizarding school, and a robe's A-line hem reads as "walking" far more
// forgivingly than fully articulated bare limbs would at this pixel
// budget, given there's no way to visually iterate the way an Aseprite
// session would.
//
// Skin is drawn in a neutral pale base tone and hair in a neutral gray
// base tone, each meant to be re-tinted client-side via Phaser's own
// sprite.setTint() (see main.ts's vendor-tint precedent) rather than
// baking every skin/hair combination into its own spritesheet. The base
// body sheet and the hair sheet are two SEPARATE PNGs with identical
// frame layout/timing, layered at runtime the same way a weapon/shield
// overlay already is — that's what lets one body sheet serve all 3 skin
// tones and one hair sheet serve all 3 hair colors per gender, instead of
// needing 2 genders x 3 skins x 3 hairs = 18 fully separate sheets.
//
// Run with `node tools/gen-human-sprites.mjs` from game2d/; requires the
// `pngjs` devDependency (`npm install --no-save pngjs` if not already
// present).
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

// Rasterizes a full 4-row x 8-col sheet (32 frames) from a pose->grid map.
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
// Skin/hair are baked directly per combination (18 = 2 genders x 3 skins
// x 3 hairs) rather than left as a neutral tone for client-side tinting —
// see this file's own top comment for why: a re-tintable overlay would
// need a THIRD sprite kept in perfect animation lockstep with the body at
// every single place the project triggers a walk/punch/idle anim, which
// is a lot of ripple/bug-surface for this scope. Baking combinations
// instead costs nothing extra to GENERATE (same code, just looped) and
// needs zero new runtime machinery — exactly the same "one texture key
// per fully-resolved look" shape every other race already uses.
const SKIN_TONES = { white: 0xe8c9a8, tan: 0xc89060, dark: 0x8a5a30 };
const HAIR_COLORS = { brown: 0x5a3a1e, blonde: 0xd9c07a, black: 0x2a2318 };
const ROBE_MALE = 0x3a3f4a; // slate-charcoal school robe
const ROBE_MALE_DARK = 0x2b2f38;
const ROBE_FEMALE = 0x463a4f; // same idea, a touch warmer/plum-leaning
const ROBE_FEMALE_DARK = 0x342b3a;
const TRIM = 0x8a7449; // brass trim/clasp, shared

const HEAD_W = 8;
const HEAD_H = 7;
const HEAD_X = 7; // centered: (22-8)/2 = 7

// A walk cycle communicated through robe-hem sway + opposite arm swing +
// a 1-cell body bob, rather than visible leg articulation (the robe
// covers the legs almost entirely, same simplification real chibi/RPG
// sprites with robed classes lean on).
const WALK_POSES = [
  { armSwing: 0, hemSway: 0, bob: 0 },
  { armSwing: 1, hemSway: 1, bob: -1 },
  { armSwing: 0, hemSway: 0, bob: 0 },
  { armSwing: -1, hemSway: -1, bob: -1 },
];

// A punch cycle: windup (arm pulled back/up) -> mid-extend -> full
// extend (fist reaches past the body silhouette in the facing direction)
// -> recover.
const PUNCH_POSES = [
  { extend: -1 },
  { extend: 1 },
  { extend: 3 },
  { extend: 1 },
];

function drawHair(grid, { facing, isFemale, bob, headY, hairColor }) {
  // A simple cap-shape covering the top/sides of the head — long enough
  // at the back for "up" facing to read as hair, and a bit longer overall
  // for the female variant (falling past the shoulders).
  grid.fillRect(HEAD_X - 1, headY - 1, HEAD_W + 2, 3, hairColor);
  grid.fillRect(HEAD_X - 1, headY + 2, 2, isFemale ? 6 : 2, hairColor);
  grid.fillRect(HEAD_X + HEAD_W - 1, headY + 2, 2, isFemale ? 6 : 2, hairColor);
  if (facing === 'up') {
    grid.fillRect(HEAD_X, headY - 1, HEAD_W, 5, hairColor);
  }
}

function drawFrame(grid, { facing, isFemale, skinColor, hairColor, armSwing = 0, hemSway = 0, bob = 0, extend = null }) {
  const robe = isFemale ? ROBE_FEMALE : ROBE_MALE;
  const robeDark = isFemale ? ROBE_FEMALE_DARK : ROBE_MALE_DARK;
  const hemFlare = isFemale ? 2 : 1; // a female robe's A-line flares a little wider at the hem

  const headY = 4 + bob;
  const shoulderY = headY + HEAD_H;
  const robeTop = shoulderY;
  const robeBottom = ROWS - 3 + bob;
  const robeHeight = robeBottom - robeTop;

  // Head + simple face/back-of-head detail.
  grid.fillRect(HEAD_X, headY, HEAD_W, HEAD_H, skinColor);
  if (facing === 'down') {
    grid.set(HEAD_X + 2, headY + 3, robeDark);
    grid.set(HEAD_X + 5, headY + 3, robeDark);
  } else if (facing === 'left' || facing === 'right') {
    const eyeX = facing === 'left' ? HEAD_X + 2 : HEAD_X + 5;
    grid.set(eyeX, headY + 3, robeDark);
  }
  // (facing 'up' shows just the back of the head — no face detail)

  // Robe body — an A-line trapezoid widening toward the hem, shifted by
  // hemSway to suggest the hem swinging as the character walks.
  const topWidth = 10;
  const topX = HEAD_X + (HEAD_W - topWidth) / 2;
  for (let row = 0; row < robeHeight; row++) {
    const t = row / Math.max(1, robeHeight - 1);
    const width = Math.round(topWidth + t * (topWidth + hemFlare * 2 + 2 - topWidth));
    const sway = Math.round(hemSway * t);
    const x = Math.round(topX - (width - topWidth) / 2) + sway;
    grid.fillRect(x, robeTop + row, width, 1, robe);
  }
  // A brass clasp at the collar, and a hem trim line.
  grid.set(HEAD_X + 3, robeTop, TRIM);
  grid.set(HEAD_X + 4, robeTop, TRIM);
  grid.fillRect(topX - 2 + Math.round(hemSway), robeBottom - 1, topWidth + hemFlare * 2 + 4, 1, robeDark);

  // Arms — sleeves in the robe tone, hands in skin tone at the cuff.
  // Facing left/right only shows the NEAR arm (a simple profile
  // simplification); facing up/down shows both.
  const armY = robeTop + 2;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? topX - 2 : topX + topWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 2, 5, robe);
    grid.fillRect(x, y + 5, 2, 2, skinColor);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    // profile: only the forward arm is visible
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  // The punching arm — drawn last so it visibly reaches past the
  // silhouette in whichever direction the character is facing.
  if (extend !== null) {
    const fistY = armY + 2;
    if (facing === 'down') grid.fillRect(HEAD_X + 1, fistY + 3 + extend, 3, 2, skinColor);
    else if (facing === 'up') grid.fillRect(HEAD_X + 1, headY - 1 - extend, 3, 2, skinColor);
    else if (facing === 'left') grid.fillRect(topX - 3 - extend, fistY, 3, 2, skinColor);
    else grid.fillRect(topX + topWidth + extend, fistY, 3, 2, skinColor);
  }

  // Hair drawn last so it sits on top of the head/robe collar.
  drawHair(grid, { facing, isFemale, bob, headY, hairColor });
}

function buildFrameSet(isFemale, skinColor, hairColor) {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const pose of WALK_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, isFemale, skinColor, hairColor, armSwing: pose.armSwing, hemSway: pose.hemSway, bob: pose.bob });
      frames[facing].push(grid);
    }
    for (const pose of PUNCH_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, isFemale, skinColor, hairColor, extend: pose.extend });
      frames[facing].push(grid);
    }
  }
  return frames;
}

for (const [genderLabel, isFemale] of [['male', false], ['female', true]]) {
  for (const [skinName, skinColor] of Object.entries(SKIN_TONES)) {
    for (const [hairName, hairColor] of Object.entries(HAIR_COLORS)) {
      const frames = buildFrameSet(isFemale, skinColor, hairColor);
      rasterizeCharacterSheet(frames, join(ASSETS_DIR, `human-${genderLabel}-${skinName}-${hairName}-spritesheet.png`));
    }
  }
}
