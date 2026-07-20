// Pixel-art generator for the "bear" monster (Great Plains — a later
// follow-up ask: "improve the bear sprite on the great plains, it is
// very sloppy"). Same 110x140/4-row/8-col rig as every other monster
// here, redrawn with real roundness (corner-trimmed silhouettes instead
// of flat rectangles), 3-tone fur shading for actual volume, a visible
// snout/nose, and a real muzzle + claws — a deliberate step up from the
// original's flatter, blockier pass.
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
    // Fills a rectangle but trims the 4 single-cell corners — a cheap
    // "rounded rect" that reads as noticeably softer/rounder than a hard
    // rectangle at this resolution.
    fillRounded(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const cornerX = xx === x || xx === x + w - 1;
          const cornerY = yy === y || yy === y + h - 1;
          if (cornerX && cornerY) continue;
          if (yy >= 0 && yy < ROWS && xx >= 0 && xx < COLS) this.cells[yy][xx] = color;
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

// ---------- Palette — a real 3-tone fur shading pass (dark/mid/light)
// on top of the original's flatter 2-tone look, plus a warm snout patch
// and a distinct nose. ----------
const FUR_DARK = 0x3a2a1c;
const FUR = 0x5c4230;
const FUR_MID = 0x6f5138;
const FUR_LIGHT = 0x8a6a4a;
const SNOUT = 0xa8815a;
const NOSE = 0x1c140e;
const EYE = 0x140d08;
const CLAW = 0xe8dcc0;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
const SWIPE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

// 'down'/'up' — a big, bulky, ROUNDED front/back view: 3-tone shaded
// body, a round head with small rounded ears, a visible snout patch +
// nose, thick legs, a stubby tail from the back.
function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 16;
  const bodyH = 11;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 12 + bob;

  if (facing === 'up') {
    grid.fillRounded(bodyX + bodyW - 4, bodyY + bodyH - 2, 4, 4, FUR_DARK);
  }

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 4, legH + Math.min(0, swing), FUR_DARK);
  drawLeg(bodyX, frontSwing);
  drawLeg(bodyX + bodyW - 4, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 7, backSwing * -1);

  // 3-tone body: dark base, mid torso, a lighter belly/chest patch.
  grid.fillRounded(bodyX, bodyY, bodyW, bodyH, FUR_DARK);
  grid.fillRounded(bodyX + 1, bodyY, bodyW - 2, bodyH - 3, FUR);
  grid.fillRounded(bodyX + 3, bodyY + 1, bodyW - 6, 4, FUR_MID);
  grid.fillRect(bodyX + 4, bodyY + 5, bodyW - 8, 2, FUR_LIGHT);

  // Big round head, small rounded ears.
  const headW = 13;
  const headH = 10;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 4;
  grid.fillRounded(headX - 2, headY - 3, 4, 4, FUR_DARK);
  grid.fillRounded(headX + headW - 2, headY - 3, 4, 4, FUR_DARK);
  grid.fillRounded(headX, headY, headW, headH, FUR);
  grid.fillRounded(headX + 2, headY + 1, headW - 4, headH - 5, FUR_MID);

  if (facing === 'down') {
    grid.fillRounded(headX + 3, headY + headH - 4, headW - 6, 5, SNOUT);
    grid.fillRect(headX + headW / 2 - 1, headY + headH - 2, 2, 2, NOSE);
    grid.set(headX + 3, headY + 3, EYE);
    grid.set(headX + headW - 4, headY + 3, EYE);
    if (lunge !== null) {
      grid.fillRect(headX - 2 - lunge, headY + headH + 2, 3, 2, CLAW);
      grid.fillRect(headX + headW - 1 + lunge, headY + headH + 2, 3, 2, CLAW);
    }
  }
}

// 'left'/'right' — rounded bulky profile: humped back, round head, short
// snout with a visible nose, 3-tone shading.
function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 17;
  const bodyH = 10;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 11 + bob;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  grid.fillRounded(tailSide - (dir === 1 ? 2 : 0), bodyY + 1, 3, 4, FUR_DARK);

  // Humped back — a taller silhouette in the middle third.
  grid.fillRect(bodyX + 4, bodyY - 1, bodyW - 8, 1, FUR);
  grid.fillRounded(bodyX, bodyY, bodyW, bodyH, FUR_DARK);
  grid.fillRounded(bodyX + 1, bodyY, bodyW - 2, bodyH - 3, FUR);
  grid.fillRounded(bodyX + (dir === 1 ? 2 : bodyW - 10), bodyY + 2, 8, 4, FUR_MID);
  grid.fillRect(bodyX + (dir === 1 ? 3 : bodyW - 8), bodyY + 4, 5, 2, FUR_LIGHT);

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

  // Round head with a short snout and a visible nose tip.
  const headW = 11;
  const headH = 10;
  const headSide2 = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const headX = dir === 1 ? headSide2 - headW + 4 : headSide2 - 4;
  const headY = bodyY - headH + 4;
  grid.fillRounded(headX, headY, headW, headH, FUR_DARK);
  grid.fillRounded(headX + 1, headY, headW - 2, headH - 2, FUR);
  grid.fillRounded(dir === 1 ? headX + headW - 4 : headX, headY - 2, 4, 4, FUR_DARK);
  const snoutW = 4;
  const snoutX = dir === 1 ? headX + headW - 1 : headX - snoutW + 1;
  grid.fillRounded(snoutX, headY + 4, snoutW, 4, SNOUT);
  grid.fillRect(dir === 1 ? snoutX + snoutW - 2 : snoutX, headY + 5, 2, 2, NOSE);
  grid.set(headX + (dir === 1 ? 3 : headW - 4), headY + 3, EYE);
  if (lunge !== null) {
    grid.fillRect(snoutX + dir * (lunge + 2), headY + bodyH - 4, 3, 2, CLAW);
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
