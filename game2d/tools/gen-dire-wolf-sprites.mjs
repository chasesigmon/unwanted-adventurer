// Pixel-art generator for the dire wolf monster (a later follow-up ask:
// "level 20 dire wolves (while menacing gnarly looking wolves bigger than
// normal wolves)"). Same coarse "big pixel" grid + EXACT character rig as
// every other monster here (see gen-imp-sprites.mjs's own header): 110x140
// frame, 4 rows (down/up/left/right), 8 cols/row (4 walk frames then 4
// punch/bite frames) — a quadruped rather than a biped, so 'left'/'right'
// draw a real side-profile body (head+snout one end, tail the other, 4
// legs along the bottom) while 'down'/'up' show a front/back view with
// legs splayed beneath a foreshortened body, the same "front/back vs
// profile" convention 2D RPG animal sprites conventionally use.
//
// Run with `node tools/gen-dire-wolf-sprites.mjs` from game2d/; requires
// the `pngjs` devDependency (already installed for the other gen-*.mjs
// scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 5;
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

// ---------- Palette — dark, gnarly, "bigger and more menacing than a
// normal wolf": charcoal/ash fur (not a warm brown), glowing amber eyes,
// visible fangs. ----------
const FUR = 0x3c3a40;
const FUR_DARK = 0x242226;
const FUR_LIGHT = 0x59565e;
const SNOUT = 0x1a1a1d;
const EYE = 0xffce3d;
const FANG = 0xf2efe6;
const CLAW = 0x151417;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
// A lunging bite instead of a punch — the same 4-beat "windup -> mid ->
// full extend -> recover" shape every other monster's own attack uses.
const BITE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

// 'down'/'up' — a front/back view: a broad foreshortened body low in the
// frame, head+ears above it, 4 legs splayed beneath, tail only visible
// from the back ('up').
function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 14;
  const bodyH = 9;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 14 + bob;

  // Tail, only peeking out below the body when facing away.
  if (facing === 'up') {
    grid.fillRect(bodyX + bodyW - 2, bodyY + bodyH - 2, 4, 6, FUR_DARK);
  }

  // 4 legs, splayed beneath the body, front pair swinging opposite the
  // back pair (a real quadruped trot).
  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 3, legH + Math.min(0, swing), FUR_DARK);
  drawLeg(bodyX + 1, frontSwing);
  drawLeg(bodyX + bodyW - 4, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 6, backSwing * -1);

  // Body — broad chest, tapering slightly toward the rear.
  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + 2, bodyY + 1, bodyW - 4, 3, FUR_LIGHT); // a lighter chest blaze

  // Head + ears, big and broad ("bigger than a normal wolf").
  const headW = 12;
  const headH = 8;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 2;
  grid.fillRect(headX - 2, headY - 3, 3, 4, FUR_DARK); // left ear
  grid.fillRect(headX + headW - 1, headY - 3, 3, 4, FUR_DARK); // right ear
  grid.fillRect(headX, headY, headW, headH, FUR);

  if (facing === 'down') {
    grid.fillRect(headX + 3, headY + headH - 3, headW - 6, 3, SNOUT);
    grid.set(headX + headW / 2 - 1, headY + headH - 1, FANG);
    grid.set(headX + headW / 2 + 1, headY + headH - 1, FANG);
    grid.set(headX + 3, headY + 3, EYE);
    grid.set(headX + headW - 4, headY + 3, EYE);
    if (lunge !== null) grid.fillRect(headX + 3, headY + headH + lunge, headW - 6, 3, SNOUT);
  }
  // 'up' shows only the back of the head/ears — no face detail.
}

// 'left'/'right' — a real side profile: elongated body, snout pointing
// the way it's facing, tail trailing the opposite way, 4 legs in a row
// along the bottom.
function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 16;
  const bodyH = 8;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 12 + bob;
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  // Tail, trailing behind.
  grid.fillRect(tailSide - (dir === 1 ? 3 : 0), bodyY - 1, 4, 3, FUR_DARK);

  // Body.
  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + (dir === 1 ? 2 : bodyW - 8), bodyY + 1, 6, 3, FUR_LIGHT);

  // 4 legs in a row along the bottom, front pair (near the head) swinging
  // opposite the back pair.
  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 3, legH + Math.min(0, swing), FUR_DARK);
  const frontX1 = dir === 1 ? bodyX + bodyW - 5 : bodyX + 2;
  const frontX2 = dir === 1 ? bodyX + bodyW - 9 : bodyX + 6;
  const backX1 = dir === 1 ? bodyX + 2 : bodyX + bodyW - 5;
  const backX2 = dir === 1 ? bodyX + 6 : bodyX + bodyW - 9;
  drawLeg(frontX1, frontSwing);
  drawLeg(frontX2, frontSwing * -1);
  drawLeg(backX1, backSwing);
  drawLeg(backX2, backSwing * -1);

  // Head + snout pointing the facing direction, ear on top, one eye,
  // bared fangs at the tip.
  const headW = 9;
  const headH = 8;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 3;
  grid.fillRect(headX, headY, headW, headH, FUR);
  grid.fillRect(dir === 1 ? headX + headW - 3 : headX, headY - 3, 3, 4, FUR_DARK); // ear
  const snoutW = 5;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 3, snoutW, 3, SNOUT);
  grid.set(dir === 1 ? snoutX + snoutW - 1 : snoutX, headY + 5, FANG);
  grid.set(headX + (dir === 1 ? 2 : headW - 3), headY + 2, EYE);
  if (lunge !== null) grid.fillRect(snoutX + dir * lunge, headY + 3, snoutW, 3, SNOUT);
}

function drawFrame(grid, params) {
  if (params.facing === 'down' || params.facing === 'up') drawFrontBack(grid, params);
  else drawProfile(grid, params);
}

function buildFrameSet() {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const pose of WALK_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, frontSwing: pose.frontSwing, backSwing: pose.backSwing, bob: pose.bob, lunge: null });
      frames[facing].push(grid);
    }
    for (const pose of BITE_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, frontSwing: 0, backSwing: 0, bob: 0, lunge: pose.lunge });
      frames[facing].push(grid);
    }
  }
  return frames;
}

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'dire-wolf-spritesheet.png'));
