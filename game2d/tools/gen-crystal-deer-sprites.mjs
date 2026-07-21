// Pixel-art generator for the "Crystal Deer" (a later follow-up ask: "Add
// a 'Crystal Deer' to Silverbranch way... classify them as 'beast'").
// Same rig/grid as gen-moose-sprites.mjs (a quadruped beast, antlers and
// all) but restyled as a translucent-looking crystal creature — pale
// icy-cyan faceted body instead of fur, glowing antlers, a bright glowing
// eye. Uses the new canvas+sharp generation pipeline (see tools/lib/
// spriteCanvas.mjs's own doc comment on why this replaces the older PIL
// convention for any NEW sprite from here on).
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createGrid, rasterizeCharacterSheet } from './lib/spriteCanvas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

// Matches client/characterSprites.ts's own FRAME_WIDTH(110)/FRAME_HEIGHT(140)
// universal character-sheet frame size exactly (CELL*COLS=110, CELL*ROWS=140)
// — every creature sprite in this project shares that one grid, monster or
// human alike.
const CELL = 5;
const COLS = 22;
const ROWS = 28;

// ---------- Palette — a pale, faceted crystal deer: icy cyan-blue body,
// brighter glassy highlights standing in for facet reflections, a
// glowing white-cyan rack of antlers and eye. ----------
const CRYSTAL = 0x8fd8e8;
const CRYSTAL_DARK = 0x4a93ad;
const CRYSTAL_LIGHT = 0xc9f2fa;
const HOOF = 0x2c5a6b;
const EYE_GLOW = 0xf2fdff;
const ANTLER = 0xd6f7ff;
const ANTLER_CORE = 0x7fe0ff;

const WALK_POSES = [
  { frontSwing: 1, backSwing: -1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
  { frontSwing: -1, backSwing: 1, bob: 0 },
  { frontSwing: 0, backSwing: 0, bob: -1 },
];
// A headbutt/charge with the crystal antlers, same 4-beat shape every
// other beast's own attack uses.
const CHARGE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

function drawAntlers(grid, cx, topY) {
  grid.fillRect(cx - 7, topY, 2, 5, ANTLER);
  grid.fillRect(cx - 9, topY - 2, 3, 2, ANTLER_CORE);
  grid.fillRect(cx - 9, topY + 1, 3, 2, ANTLER_CORE);
  grid.fillRect(cx + 5, topY, 2, 5, ANTLER);
  grid.fillRect(cx + 6, topY - 2, 3, 2, ANTLER_CORE);
  grid.fillRect(cx + 6, topY + 1, 3, 2, ANTLER_CORE);
}

function drawFrontBack(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const bodyW = 15;
  const bodyH = 9;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 14 + bob;

  if (facing === 'up') {
    grid.fillRect(bodyX + bodyW - 3, bodyY + bodyH - 1, 3, 3, CRYSTAL_DARK);
  }

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 2, legH + Math.min(0, swing), HOOF);
  drawLeg(bodyX, frontSwing);
  drawLeg(bodyX + bodyW - 2, frontSwing * -1);
  drawLeg(bodyX + 3, backSwing);
  drawLeg(bodyX + bodyW - 5, backSwing * -1);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? CRYSTAL : CRYSTAL_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  // A faceted highlight band down the spine, the "glassy" tell.
  grid.fillRect(bodyX + 2, bodyY + 1, bodyW - 4, 2, CRYSTAL_LIGHT);

  const headW = 9;
  const headH = 7;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - headH + 1;
  if (facing === 'down') drawAntlers(grid, Math.round(headX + headW / 2), headY - 5);
  grid.fillRect(headX - 1, headY - 2, 2, 3, CRYSTAL_DARK);
  grid.fillRect(headX + headW - 1, headY - 2, 2, 3, CRYSTAL_DARK);
  grid.fillRect(headX, headY, headW, headH, CRYSTAL);

  if (facing === 'down') {
    grid.fillRect(headX + 2, headY + headH - 3, headW - 4, 3, CRYSTAL_DARK);
    grid.set(headX + 2, headY + 2, EYE_GLOW);
    grid.set(headX + headW - 3, headY + 2, EYE_GLOW);
    if (lunge !== null) grid.fillRect(headX + 2, headY + headH + lunge, headW - 4, 3, CRYSTAL_DARK);
  }
}

function drawProfile(grid, { facing, frontSwing, backSwing, bob, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 16;
  const bodyH = 8;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 12 + bob;
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  grid.fillRect(tailSide - (dir === 1 ? 2 : 0), bodyY, 2, 2, CRYSTAL_DARK);

  for (let row = 0; row < bodyH; row++) {
    const shade = row < bodyH - 3 ? CRYSTAL : CRYSTAL_DARK;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.fillRect(bodyX + (dir === 1 ? 2 : bodyW - 8), bodyY + 1, 6, 2, CRYSTAL_LIGHT);

  const legY = bodyY + bodyH - 1;
  const legH = ROWS - legY - 2;
  const drawLeg = (x, swing) => grid.fillRect(x, legY + Math.max(0, -swing), 2, legH + Math.min(0, swing), HOOF);
  const frontX1 = dir === 1 ? bodyX + bodyW - 5 : bodyX + 2;
  const frontX2 = dir === 1 ? bodyX + bodyW - 9 : bodyX + 6;
  const backX1 = dir === 1 ? bodyX + 2 : bodyX + bodyW - 5;
  const backX2 = dir === 1 ? bodyX + 6 : bodyX + bodyW - 9;
  drawLeg(frontX1, frontSwing);
  drawLeg(frontX2, frontSwing * -1);
  drawLeg(backX1, backSwing);
  drawLeg(backX2, backSwing * -1);

  const headW = 8;
  const headH = 7;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 2;
  // One antler visible above the head in profile, on the far side.
  grid.fillRect(headX + (dir === 1 ? 1 : headW - 4), headY - 5, 3, 5, ANTLER);
  grid.fillRect(headX + (dir === 1 ? -1 : headW - 2), headY - 6, 4, 2, ANTLER_CORE);
  grid.fillRect(headX, headY, headW, headH, CRYSTAL);
  const snoutW = 4;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 3, snoutW, 3, CRYSTAL_DARK);
  grid.set(headX + (dir === 1 ? 2 : headW - 3), headY + 2, EYE_GLOW);
  if (lunge !== null) grid.fillRect(snoutX + dir * lunge, headY + 3, snoutW, 3, CRYSTAL_DARK);
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
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, frontSwing: pose.frontSwing, backSwing: pose.backSwing, bob: pose.bob, lunge: null });
      frames[facing].push(grid);
    }
    for (const pose of CHARGE_POSES) {
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, frontSwing: 0, backSwing: 0, bob: 0, lunge: pose.lunge });
      frames[facing].push(grid);
    }
  }
  return frames;
}

await rasterizeCharacterSheet(buildFrameSet(), CELL, COLS, ROWS, 8, join(ASSETS_DIR, 'crystal-deer-spritesheet.png'));
