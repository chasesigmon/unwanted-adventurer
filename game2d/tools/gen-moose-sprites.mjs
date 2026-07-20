// Pixel-art generator for the "moose" monster (a later follow-up ask:
// "add some level 6 moose to Grimoak Grounds"). Same rig/grid as
// gen-dire-wolf-sprites.mjs, adapted: bulkier body, brown palette, a
// blunt snout (no fangs — a moose headbutts/charges, doesn't bite), and
// a real rack of antlers on top of the head (the one obviously
// moose-specific feature).
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

// ---------- Palette — a big, bulky brown moose with a real rack of
// antlers. ----------
const FUR = 0x4a3826;
const FUR_DARK = 0x2e2116;
const FUR_LIGHT = 0x6b5138;
const SNOUT = 0x1f160f;
const EYE = 0x120d09;
const ANTLER = 0xd8c9a8;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
// A headbutt/charge instead of a bite — same 4-beat shape every other
// monster's own attack uses.
const CHARGE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

function drawAntlers(grid, cx, topY) {
  // A simple branching rack — a central beam each side with 2 tines.
  grid.fillRect(cx - 7, topY, 2, 5, ANTLER);
  grid.fillRect(cx - 9, topY - 2, 3, 2, ANTLER);
  grid.fillRect(cx - 9, topY + 1, 3, 2, ANTLER);
  grid.fillRect(cx + 5, topY, 2, 5, ANTLER);
  grid.fillRect(cx + 6, topY - 2, 3, 2, ANTLER);
  grid.fillRect(cx + 6, topY + 1, 3, 2, ANTLER);
}

function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 16;
  const bodyH = 10;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 14 + bob;

  if (facing === 'up') {
    grid.fillRect(bodyX + bodyW - 3, bodyY + bodyH - 1, 3, 3, FUR_DARK);
  }

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 3, legH + Math.min(0, swing), FUR_DARK);
  drawLeg(bodyX, frontSwing);
  drawLeg(bodyX + bodyW - 3, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 6, backSwing * -1);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + 2, bodyY + 1, bodyW - 4, 3, FUR_LIGHT);

  const headW = 11;
  const headH = 8;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 1;
  if (facing === 'down') drawAntlers(grid, Math.round(headX + headW / 2), headY - 5);
  grid.fillRect(headX - 1, headY - 2, 2, 3, FUR_DARK);
  grid.fillRect(headX + headW - 1, headY - 2, 2, 3, FUR_DARK);
  grid.fillRect(headX, headY, headW, headH, FUR);

  if (facing === 'down') {
    grid.fillRect(headX + 2, headY + headH - 4, headW - 4, 4, SNOUT);
    grid.set(headX + 2, headY + 2, EYE);
    grid.set(headX + headW - 3, headY + 2, EYE);
    if (lunge !== null) grid.fillRect(headX + 2, headY + headH + lunge, headW - 4, 4, SNOUT);
  }
}

function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 17;
  const bodyH = 9;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 12 + bob;
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  grid.fillRect(tailSide - (dir === 1 ? 2 : 0), bodyY, 2, 2, FUR_DARK);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? FUR : FUR_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + (dir === 1 ? 2 : bodyW - 8), bodyY + 1, 6, 3, FUR_LIGHT);

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

  const headW = 9;
  const headH = 8;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 2;
  // One antler visible above the head in profile, on the far side.
  grid.fillRect(headX + (dir === 1 ? 1 : headW - 4), headY - 5, 3, 5, ANTLER);
  grid.fillRect(headX + (dir === 1 ? -1 : headW - 2), headY - 6, 4, 2, ANTLER);
  grid.fillRect(headX, headY, headW, headH, FUR);
  const snoutW = 5;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 4, snoutW, 3, SNOUT);
  grid.set(headX + (dir === 1 ? 2 : headW - 3), headY + 2, EYE);
  if (lunge !== null) grid.fillRect(snoutX + dir * lunge, headY + 4, snoutW, 3, SNOUT);
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
    for (const pose of CHARGE_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, frontSwing: 0, backSwing: 0, bob: 0, lunge: pose.lunge });
      frames[facing].push(grid);
    }
  }
  return frames;
}

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'moose-spritesheet.png'));
