// Pixel-art generator for the plain "wolf" monster (a later follow-up
// ask: "add some level 3 wolves to Grimoak Grounds"). Same rig/grid as
// gen-dire-wolf-sprites.mjs (which this is adapted from) but smaller and
// lighter — an ordinary wolf, not the "bigger and more menacing" dire
// wolf variant — warm grey-brown fur, normal amber (not glowing) eyes.
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

// ---------- Palette — an ordinary wolf: warm grey-brown fur, normal
// (not glowing) amber eyes, smaller than the dire wolf variant. ----------
const FUR = 0x6b5d4f;
const FUR_DARK = 0x4a4038;
const FUR_LIGHT = 0x8a7a68;
const SNOUT = 0x2a2420;
const EYE = 0xc9962e;
const FANG = 0xf2efe6;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
const BITE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 12;
  const bodyH = 8;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 15 + bob;

  if (facing === 'up') {
    grid.fillRect(bodyX + bodyW - 2, bodyY + bodyH - 2, 3, 5, FUR_DARK);
  }

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 2, legH + Math.min(0, swing), FUR_DARK);
  drawLeg(bodyX + 1, frontSwing);
  drawLeg(bodyX + bodyW - 3, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 5, backSwing * -1);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + 2, bodyY + 1, bodyW - 4, 2, FUR_LIGHT);

  const headW = 10;
  const headH = 7;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 2;
  grid.fillRect(headX - 2, headY - 3, 2, 3, FUR_DARK);
  grid.fillRect(headX + headW - 1, headY - 3, 2, 3, FUR_DARK);
  grid.fillRect(headX, headY, headW, headH, FUR);

  if (facing === 'down') {
    grid.fillRect(headX + 3, headY + headH - 2, headW - 6, 2, SNOUT);
    grid.set(headX + headW / 2 - 1, headY + headH - 1, FANG);
    grid.set(headX + 3, headY + 2, EYE);
    grid.set(headX + headW - 4, headY + 2, EYE);
    if (lunge !== null) grid.fillRect(headX + 3, headY + headH + lunge, headW - 6, 2, SNOUT);
  }
}

function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 14;
  const bodyH = 7;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 13 + bob;
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  grid.fillRect(tailSide - (dir === 1 ? 3 : 0), bodyY - 1, 3, 2, FUR_DARK);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 2 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + (dir === 1 ? 2 : bodyW - 7), bodyY + 1, 5, 2, FUR_LIGHT);

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 2, legH + Math.min(0, swing), FUR_DARK);
  const frontX1 = dir === 1 ? bodyX + bodyW - 4 : bodyX + 2;
  const frontX2 = dir === 1 ? bodyX + bodyW - 7 : bodyX + 5;
  const backX1 = dir === 1 ? bodyX + 2 : bodyX + bodyW - 4;
  const backX2 = dir === 1 ? bodyX + 5 : bodyX + bodyW - 7;
  drawLeg(frontX1, frontSwing);
  drawLeg(frontX2, frontSwing * -1);
  drawLeg(backX1, backSwing);
  drawLeg(backX2, backSwing * -1);

  const headW = 8;
  const headH = 7;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 3;
  grid.fillRect(headX, headY, headW, headH, FUR);
  grid.fillRect(dir === 1 ? headX + headW - 2 : headX, headY - 3, 2, 3, FUR_DARK);
  const snoutW = 4;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 3, snoutW, 2, SNOUT);
  grid.set(dir === 1 ? snoutX + snoutW - 1 : snoutX, headY + 4, FANG);
  grid.set(headX + (dir === 1 ? 2 : headW - 3), headY + 2, EYE);
  if (lunge !== null) grid.fillRect(snoutX + dir * lunge, headY + 3, snoutW, 2, SNOUT);
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

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'wolf-spritesheet.png'));
