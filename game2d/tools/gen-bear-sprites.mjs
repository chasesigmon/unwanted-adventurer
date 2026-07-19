// Pixel-art generator for the bear monster (a later follow-up ask: "in
// the great plains add level 20 bears (similar stats to the dire
// wolves)"). Same rig as gen-dire-wolf-sprites.mjs (110x140 frame, 4
// rows down/up/left/right, 8 cols/row: 4 walk then 4 swipe/bite frames,
// quadruped front/back vs profile shape) — bulkier and rounder than the
// wolf, warm brown fur instead of ash-gray, small round ears, dark eyes
// (no glow), no visible fangs.
//
// Run with `node tools/gen-bear-sprites.mjs` from game2d/; requires the
// `pngjs` devDependency (already installed for the other gen-*.mjs
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

// ---------- Palette — bulky and warm-toned, unlike the dire wolf's ash
// gray. ----------
const FUR = 0x6b4a30;
const FUR_DARK = 0x4a3220;
const FUR_LIGHT = 0x8a6644;
const SNOUT = 0x2e2018;
const EYE = 0x1c140e;
const CLAW = 0xe8e0d0;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
// A swiping claw strike instead of a punch — same 4-beat shape every
// other monster's own attack uses.
const SWIPE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

// 'down'/'up' — a front/back view: a big, bulky foreshortened body low in
// the frame, round head+small ears above it, 4 thick legs splayed
// beneath, a stubby tail only visible from the back ('up').
function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 16;
  const bodyH = 10;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 13 + bob;

  if (facing === 'up') {
    grid.fillRect(bodyX + bodyW - 3, bodyY + bodyH - 1, 3, 3, FUR_DARK);
  }

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 4, legH + Math.min(0, swing), FUR_DARK);
  drawLeg(bodyX, frontSwing);
  drawLeg(bodyX + bodyW - 4, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 7, backSwing * -1);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + 3, bodyY + 1, bodyW - 6, 3, FUR_LIGHT);

  // Big round head, small round ears — a bear's own broad, rounded
  // silhouette rather than the wolf's pointed one.
  const headW = 13;
  const headH = 9;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 3;
  grid.fillRect(headX - 1, headY - 2, 3, 3, FUR_DARK);
  grid.fillRect(headX + headW - 2, headY - 2, 3, 3, FUR_DARK);
  grid.fillRect(headX, headY, headW, headH, FUR);

  if (facing === 'down') {
    grid.fillRect(headX + 4, headY + headH - 2, headW - 8, 3, SNOUT);
    grid.set(headX + 4, headY + 3, EYE);
    grid.set(headX + headW - 5, headY + 3, EYE);
    if (lunge !== null) {
      grid.fillRect(headX - 2 - lunge, headY + headH + 1, 3, 2, CLAW);
      grid.fillRect(headX + headW - 1 + lunge, headY + headH + 1, 3, 2, CLAW);
    }
  }
}

// 'left'/'right' — bulky side profile: a broad hump-backed body, round
// head with short snout, 4 thick legs, a stubby tail.
function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 17;
  const bodyH = 9;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 11 + bob;
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  grid.fillRect(tailSide - (dir === 1 ? 2 : 0), bodyY, 3, 3, FUR_DARK);

  // A humped back — one row taller in the middle, the bear's own
  // silhouette cue.
  grid.fillRect(bodyX + 4, bodyY - 1, bodyW - 8, 1, FUR);
  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + (dir === 1 ? 2 : bodyW - 9), bodyY + 2, 7, 3, FUR_LIGHT);

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 4, legH + Math.min(0, swing), FUR_DARK);
  const frontX1 = dir === 1 ? bodyX + bodyW - 6 : bodyX + 2;
  const frontX2 = dir === 1 ? bodyX + bodyW - 11 : bodyX + 7;
  const backX1 = dir === 1 ? bodyX + 2 : bodyX + bodyW - 6;
  const backX2 = dir === 1 ? bodyX + 7 : bodyX + bodyW - 11;
  drawLeg(frontX1, frontSwing);
  drawLeg(frontX2, frontSwing * -1);
  drawLeg(backX1, backSwing);
  drawLeg(backX2, backSwing * -1);

  // Round head with a short snout (much stubbier than the wolf's).
  const headW = 10;
  const headH = 9;
  const headX = dir === 1 ? headSide - headW + 4 : headSide - 4;
  const headY = bodyY - headH + 4;
  grid.fillRect(headX, headY, headW, headH, FUR);
  grid.fillRect(dir === 1 ? headX + headW - 3 : headX, headY - 2, 3, 3, FUR_DARK);
  const snoutW = 3;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 4, snoutW, 3, SNOUT);
  grid.set(headX + (dir === 1 ? 3 : headW - 4), headY + 3, EYE);
  if (lunge !== null) {
    grid.fillRect(snoutX + dir * (lunge + 2), headY + bodyH - 3, 3, 2, CLAW);
  }
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
    for (const pose of SWIPE_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, frontSwing: 0, backSwing: 0, bob: 0, lunge: pose.lunge });
      frames[facing].push(grid);
    }
  }
  return frames;
}

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'bear-spritesheet.png'));
