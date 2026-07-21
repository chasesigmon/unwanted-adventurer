// Pixel-art generator for the "Crystal Wyvern" (a later follow-up ask:
// "Add 'Crystal Wyvern' flying creature roaming/flying around Silverbranch
// Lake... classify as 'beast'"). Same 110x140/4-row/8-col frame convention
// as every other monster, modeled on gen-falcon-sprites.mjs's own
// spread/profile wing rig but scaled up into a small dragon: broad
// membrane wings, a long serpentine tail, horns, and the same icy-crystal
// palette family as Crystal Deer (a shared "crystal" creature line) tinted
// toward blue-violet to read as a distinct, tougher species. Uses the
// canvas+sharp generation pipeline (see tools/lib/spriteCanvas.mjs).
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createGrid, rasterizeCharacterSheet } from './lib/spriteCanvas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 5;
const COLS = 22;
const ROWS = 28;

// ---------- Palette — a blue-violet crystalline wyvern: faceted scale
// body, glassy membrane wings, a glowing core along the spine/tail. ----------
const CRYSTAL = 0x6a7fe0;
const CRYSTAL_DARK = 0x3d4a93;
const CRYSTAL_LIGHT = 0xb8c6fa;
const WING_MEMBRANE = 0x8f6bd6;
const WING_DARK = 0x5a3f93;
const HORN = 0xe8e6fa;
const EYE_GLOW = 0xf2e8ff;
const TALON = 0x2c2a5a;
const CORE_GLOW = 0xd0e0ff;

const FLAP_POSES = [
  { wingSpread: 0, wingUp: 0 },
  { wingSpread: 3, wingUp: -3 },
  { wingSpread: 0, wingUp: 0 },
  { wingSpread: 3, wingUp: 3 },
];
const DIVE_POSES = [{ dive: -1 }, { dive: 1 }, { dive: 3 }, { dive: 1 }];

// 'down'/'up' — wings spread wide, viewed from below/above.
function drawSpread(grid, { facing, wingSpread, wingUp, dive }) {
  const bodyW = 7;
  const bodyH = 11;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 10;

  const wingW = 9 + wingSpread;
  const wingY = bodyY + 1 + wingUp;
  const wingShade = facing === 'down' ? WING_MEMBRANE : WING_DARK;
  grid.fillRect(bodyX - wingW, wingY, wingW, 4, wingShade);
  grid.fillRect(bodyX - wingW + 1, wingY + 4, wingW - 2, 2, WING_DARK);
  grid.fillRect(bodyX + bodyW, wingY, wingW, 4, wingShade);
  grid.fillRect(bodyX + bodyW + 1, wingY + 4, wingW - 2, 2, WING_DARK);

  // Long serpentine tail trailing below the body.
  grid.fillRect(bodyX + 2, bodyY + bodyH - 1, bodyW - 4, 6, CRYSTAL_DARK);
  grid.set(Math.round(COLS / 2), bodyY + bodyH + 4, CORE_GLOW);

  for (let row = 0; row < bodyH; row++) {
    const shade = row > bodyH - 5 ? CRYSTAL_LIGHT : CRYSTAL;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }
  grid.set(bodyX + 1, bodyY + 3, CORE_GLOW);
  grid.set(bodyX + bodyW - 2, bodyY + 3, CORE_GLOW);

  const headW = 7;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - 6;
  if (facing === 'down') {
    grid.fillRect(headX, headY - 3, 2, 4, HORN);
    grid.fillRect(headX + headW - 2, headY - 3, 2, 4, HORN);
  }
  grid.fillRect(headX, headY, headW, 6, CRYSTAL);
  if (facing === 'down') {
    grid.set(headX + 1, headY + 2, EYE_GLOW);
    grid.set(headX + headW - 2, headY + 2, EYE_GLOW);
    grid.fillRect(headX + 1, headY + 5, headW - 2, 2, CRYSTAL_DARK);
    if (dive !== null) grid.fillRect(headX + 1, headY + 6 + dive, headW - 2, 2, CRYSTAL_DARK);
  }
}

// 'left'/'right' — a side profile: folded wing, long tail, horned head.
function drawProfile(grid, { facing, wingUp, dive }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 13;
  const bodyH = 9;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 11 + Math.round(wingUp / 2);
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  // Long tail trailing behind.
  grid.fillRect(tailSide - (dir === 1 ? 6 : 0), bodyY + 2, 6, 3, CRYSTAL_DARK);
  grid.set(tailSide - (dir === 1 ? 6 : -1), bodyY + 3, CORE_GLOW);

  // Folded wing along the back.
  grid.fillRect(bodyX + (dir === 1 ? 1 : 3), bodyY - 3, bodyW - 4, 5, WING_DARK);

  for (let row = 0; row < bodyH; row++) {
    const shade = row > bodyH - 3 ? CRYSTAL_LIGHT : CRYSTAL;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }

  grid.fillRect(bodyX + bodyW / 2 - 1, bodyY + bodyH - 1, 2, 2, TALON);

  const headW = 8;
  const headH = 7;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 2;
  grid.fillRect(headX + (dir === 1 ? headW - 3 : 0), headY - 3, 2, 4, HORN);
  grid.fillRect(headX, headY, headW, headH, CRYSTAL);
  grid.set(headX + (dir === 1 ? headW - 2 : 1), headY + 2, EYE_GLOW);
  const snoutW = 4;
  const snoutX = dir === 1 ? headX + headW : headX - snoutW;
  grid.fillRect(snoutX, headY + 3, snoutW, 3, CRYSTAL_DARK);
  if (dive !== null) grid.fillRect(snoutX + dir * dive, headY + 3, snoutW, 3, CRYSTAL_DARK);
}

function drawFrame(grid, params) {
  if (params.facing === 'down' || params.facing === 'up') drawSpread(grid, params);
  else drawProfile(grid, params);
}

function buildFrameSet() {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const pose of FLAP_POSES) {
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, wingSpread: pose.wingSpread, wingUp: pose.wingUp, dive: null });
      frames[facing].push(grid);
    }
    for (const pose of DIVE_POSES) {
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, wingSpread: 0, wingUp: 0, dive: pose.dive });
      frames[facing].push(grid);
    }
  }
  return frames;
}

await rasterizeCharacterSheet(buildFrameSet(), CELL, COLS, ROWS, 8, join(ASSETS_DIR, 'crystal-wyvern-spritesheet.png'));
