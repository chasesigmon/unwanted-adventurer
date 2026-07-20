// Pixel-art generator for the "falcon" monster (a later follow-up ask:
// "add some level 8 falcons in Grimoak Grounds that fly around"). Same
// 110x140/4-row/8-col frame convention as every other monster here, but a
// bird instead of a quadruped: 'down'/'up' show it from below/above with
// wings spread wide (as if flying toward/away from the viewer), 'left'/
// 'right' show a side profile with folded wings and a hooked beak. The
// "walk" cycle is a wing-flap (up/down) instead of legs; the "attack"
// cycle is a diving talon strike.
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

// ---------- Palette — a bird of prey: slate-brown plumage, a pale
// underside/chest, a hooked yellow beak, sharp eyes. ----------
const PLUME = 0x5a4a3c;
const PLUME_DARK = 0x3a2f26;
const PLUME_LIGHT = 0xc9b89a;
const BEAK = 0xd9a53a;
const EYE = 0x1a1310;
const TALON = 0xe0c060;

const FLAP_POSES = [{ wingSpread: 0, wingUp: 0 }, { wingSpread: 2, wingUp: -2 }, { wingSpread: 0, wingUp: 0 }, { wingSpread: 2, wingUp: 2 }];
const DIVE_POSES = [{ dive: -1 }, { dive: 1 }, { dive: 3 }, { dive: 1 }];

// 'down'/'up' — wings spread wide, viewed from below/above (flying
// toward/away from the viewer).
function drawSpread(grid, { facing, wingSpread, wingUp, dive }) {
  const bodyW = 6;
  const bodyH = 10;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 11;

  // Wings — two broad triangular-ish spans either side of the body,
  // flapping up/down between frames.
  const wingW = 8 + wingSpread;
  const wingY = bodyY + 1 + wingUp;
  grid.fillRect(bodyX - wingW, wingY, wingW, 3, facing === 'down' ? PLUME : PLUME_DARK);
  grid.fillRect(bodyX - wingW + 1, wingY + 3, wingW - 2, 2, PLUME_DARK);
  grid.fillRect(bodyX + bodyW, wingY, wingW, 3, facing === 'down' ? PLUME : PLUME_DARK);
  grid.fillRect(bodyX + bodyW + 1, wingY + 3, wingW - 2, 2, PLUME_DARK);

  // Tail, fanned out below the body.
  grid.fillRect(bodyX + 1, bodyY + bodyH - 1, bodyW - 2, 4, PLUME_DARK);

  // Body.
  for (let row = 0; row < bodyH; row++) {
    const shade = facing === 'down' && row > bodyH - 5 ? PLUME_LIGHT : PLUME;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }

  // Head + beak (down only — the back of the head has no face detail).
  const headW = 6;
  const headX = Math.round((COLS - headW) / 2);
  const headY = bodyY - 5;
  grid.fillRect(headX, headY, headW, 5, PLUME);
  if (facing === 'down') {
    grid.set(headX + 1, headY + 1, EYE);
    grid.set(headX + headW - 2, headY + 1, EYE);
    grid.fillRect(headX + 1, headY + 4, headW - 2, 2, BEAK);
    if (dive !== null) grid.fillRect(headX + 1, headY + 5 + dive, headW - 2, 2, BEAK);
  }
}

// 'left'/'right' — a side profile: folded wing along the back, a hooked
// beak pointing the facing direction, talons tucked beneath.
function drawProfile(grid, { facing, wingUp, dive }) {
  const dir = facing === 'right' ? 1 : -1;
  const bodyW = 12;
  const bodyH = 8;
  const bodyX = Math.round((COLS - bodyW) / 2);
  const bodyY = 12 + Math.round(wingUp / 2);
  const headSide = dir === 1 ? bodyX + bodyW - 1 : bodyX;
  const tailSide = dir === 1 ? bodyX : bodyX + bodyW - 1;

  // Tail feathers, trailing behind.
  grid.fillRect(tailSide - (dir === 1 ? 4 : 0), bodyY, 4, 3, PLUME_DARK);

  // Folded wing along the back.
  grid.fillRect(bodyX + (dir === 1 ? 1 : 3), bodyY - 2, bodyW - 4, 4, PLUME_DARK);

  // Body.
  for (let row = 0; row < bodyH; row++) {
    const shade = row > bodyH - 3 ? PLUME_LIGHT : PLUME;
    grid.fillRect(bodyX, bodyY + row, bodyW, 1, shade);
  }

  // Talons, tucked beneath.
  grid.fillRect(bodyX + bodyW / 2 - 1, bodyY + bodyH - 1, 2, 2, TALON);

  // Head + hooked beak pointing the facing direction, one eye.
  const headW = 7;
  const headH = 7;
  const headX = dir === 1 ? headSide - headW + 3 : headSide - 3;
  const headY = bodyY - headH + 3;
  grid.fillRect(headX, headY, headW, headH, PLUME);
  grid.set(headX + (dir === 1 ? headW - 2 : 1), headY + 2, EYE);
  const beakW = 4;
  const beakX = dir === 1 ? headX + headW : headX - beakW;
  grid.fillRect(beakX, headY + 3, beakW, 2, BEAK);
  if (dive !== null) grid.fillRect(beakX + dir * dive, headY + 3, beakW, 2, BEAK);
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
      const grid = createGrid();
      drawFrame(grid, { facing, wingSpread: pose.wingSpread, wingUp: pose.wingUp, dive: null });
      frames[facing].push(grid);
    }
    for (const pose of DIVE_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, wingSpread: 0, wingUp: 0, dive: pose.dive });
      frames[facing].push(grid);
    }
  }
  return frames;
}

rasterizeCharacterSheet(buildFrameSet(), join(ASSETS_DIR, 'falcon-spritesheet.png'));
