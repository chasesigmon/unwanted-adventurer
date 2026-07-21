// Pixel-art generator for the "Runestone Canyon Dweller" (a later
// follow-up ask: "new creature 'Runestone Canyon Dweller' levels 18-20...
// looks like runed giant serpents/wyrms... classify as 'beast'"). A
// legless, sinuous serpent body (unlike the quadruped rigs every other
// beast in this file uses) made of tapering coiled segments with glowing
// carved rune markings, a horned wyrm head with fangs and glowing eyes.
// Uses the canvas+sharp generation pipeline (see tools/lib/spriteCanvas.mjs).
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createGrid, rasterizeCharacterSheet } from './lib/spriteCanvas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

// Matches client/characterSprites.ts's own FRAME_WIDTH(110)/FRAME_HEIGHT(140).
const CELL = 5;
const COLS = 22;
const ROWS = 28;

// ---------- Palette — dark carved stone-scale body with glowing violet
// rune markings, bone-white fangs, glowing violet eyes. ----------
const SCALE = 0x4a4658;
const SCALE_DARK = 0x2e2a38;
const SCALE_LIGHT = 0x6e6880;
const RUNE_GLOW = 0xb28cff;
const RUNE_CORE = 0x6b3fd6;
const EYE_GLOW = 0xd9baff;
const FANG = 0xe8e0f0;
const HORN = 0x8a7f9c;

// Wave phase (in segment-offset units) travels down the body across the 4
// walk frames to fake a slither; the two "attack" poses lunge the head.
const WALK_PHASES = [0, 1, 2, 3];
const CHARGE_POSES = [{ lunge: -1 }, { lunge: 1 }, { lunge: 3 }, { lunge: 1 }];

const SEGMENTS = 7;

function segmentOffset(index, phase) {
  // A simple traveling sine-like wave using a small lookup so segments
  // alternate left/right (or up/down) as the wave passes through them.
  const t = (index + phase) % 4;
  return [0, 1, 0, -1][t];
}

function drawFrontBack(grid, { facing, phase, lunge }) {
  const cx = Math.round(COLS / 2);
  const segH = 3;
  const topY = 3;
  // Body: coiled stack of segments running down the frame, each offset
  // left/right by the wave and tapering narrower toward the tail.
  for (let i = 0; i < SEGMENTS; i++) {
    const w = Math.max(6, 13 - i);
    const offset = segmentOffset(i, phase) * 2;
    const x = cx - Math.round(w / 2) + offset;
    const y = topY + i * segH;
    const shade = i % 2 === 0 ? SCALE : SCALE_DARK;
    grid.fillRect(x, y, w, segH, shade);
    grid.fillRect(x + 1, y, w - 2, 1, SCALE_LIGHT);
    // A glowing rune mark on every other segment.
    if (i % 2 === 1) grid.set(x + Math.round(w / 2), y + 1, RUNE_GLOW);
  }

  const headW = 10;
  const headH = 7;
  const headX = cx - Math.round(headW / 2);
  const headY = topY - headH + 2;
  grid.fillRect(headX + 1, headY - 3, 2, 4, HORN);
  grid.fillRect(headX + headW - 3, headY - 3, 2, 4, HORN);
  grid.fillRect(headX, headY, headW, headH, SCALE);
  grid.fillRect(headX + 1, headY + 1, headW - 2, 2, SCALE_LIGHT);

  if (facing === 'down') {
    grid.set(headX + 2, headY + 3, EYE_GLOW);
    grid.set(headX + headW - 3, headY + 3, EYE_GLOW);
    const jawY = headY + headH + Math.max(0, lunge ?? 0);
    grid.fillRect(headX + 2, jawY, 2, 3, FANG);
    grid.fillRect(headX + headW - 4, jawY, 2, 3, FANG);
  }
}

function drawProfile(grid, { facing, phase, lunge }) {
  const dir = facing === 'right' ? 1 : -1;
  const cy = Math.round(ROWS / 2) - 2;
  const segW = 3;
  const startX = dir === 1 ? 1 : COLS - 1;
  for (let i = 0; i < SEGMENTS; i++) {
    const h = Math.max(5, 12 - i);
    const offset = segmentOffset(i, phase) * 2;
    const x = dir === 1 ? startX + i * segW : startX - i * segW - segW;
    const y = cy - Math.round(h / 2) + offset;
    const shade = i % 2 === 0 ? SCALE : SCALE_DARK;
    grid.fillRect(x, y, segW, h, shade);
    grid.fillRect(x, y + 1, segW, 1, SCALE_LIGHT);
    if (i % 2 === 1) grid.set(x + 1, y + Math.round(h / 2), RUNE_GLOW);
  }

  const headW = 7;
  const headH = 8;
  const headEdgeX = dir === 1 ? startX + SEGMENTS * segW : startX - SEGMENTS * segW - headW;
  const headY = cy - Math.round(headH / 2);
  grid.fillRect(headEdgeX + (dir === 1 ? headW - 3 : 1), headY - 3, 2, 4, HORN);
  grid.fillRect(headEdgeX, headY, headW, headH, SCALE);
  grid.fillRect(headEdgeX, headY + 1, headW, 2, SCALE_LIGHT);
  grid.set(headEdgeX + (dir === 1 ? headW - 2 : 1), headY + 3, EYE_GLOW);
  const snoutX = dir === 1 ? headEdgeX + headW + (lunge ?? 0) : headEdgeX - 3 - (lunge ?? 0);
  grid.fillRect(snoutX, headY + 4, 3, 2, FANG);
}

function drawFrame(grid, params) {
  if (params.facing === 'down' || params.facing === 'up') drawFrontBack(grid, params);
  else drawProfile(grid, params);
}

function buildFrameSet() {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const phase of WALK_PHASES) {
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, phase, lunge: null });
      frames[facing].push(grid);
    }
    for (const pose of CHARGE_POSES) {
      const grid = createGrid(COLS, ROWS);
      drawFrame(grid, { facing, phase: 0, lunge: pose.lunge });
      frames[facing].push(grid);
    }
  }
  return frames;
}

await rasterizeCharacterSheet(buildFrameSet(), CELL, COLS, ROWS, 8, join(ASSETS_DIR, 'runestone-canyon-dweller-spritesheet.png'));
