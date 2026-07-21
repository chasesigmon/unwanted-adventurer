// Evolved-form sprites for Kortho's own griffin/elemental/phoenix pets (a
// later follow-up ask: "should evolve into 'elemental' at level 5 (same
// pattern for young griffin→griffin, young phoenix→phoenix)... all
// evolved forms need new/enhanced sprites"). Same "bigger canvas, bigger
// grid, genuinely larger not just rescaled" shape tools/gen-pet-evolved-
// assets.mjs already established for puppy/kitten/piglet's own dog/cat/
// boar evolved forms (32x32 at 2px/cell, a 16x16 grid) — but drawn via
// the canvas+sharp pipeline (tools/lib/spriteCanvas.mjs), since these are
// NEW sprites, not a redo of existing art (see CLAUDE.md's own Assets
// section on why new work uses that pipeline now instead of the older
// pngjs technique gen-pet-evolved-assets.mjs itself still uses).
//
// spriteCanvas.mjs's own rasterizeCharacterSheet/rasterizeSingleImage
// don't fit a pet's own "flat strip of N frames, no 4-facing-row grid"
// shape, so this rasterizes the strip directly with the same canvas+sharp
// enhancement pass (sharpen + a small saturation/brightness lift) those
// helpers use, for a consistent look across every sprite this pipeline
// produces.
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { createGrid, hex } from './lib/spriteCanvas.mjs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 2;
const GRID = 16; // 16x16 cells * 2px = 32x32 per frame -- matches PET_EVOLVED_FRAME_WIDTH/HEIGHT.

async function rasterizeFrameStrip(grids, outPath) {
  const frameWidth = GRID * CELL;
  const frameHeight = GRID * CELL;
  const canvas = createCanvas(frameWidth * grids.length, frameHeight);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  grids.forEach((grid, frameIndex) => {
    const offsetX = frameIndex * frameWidth;
    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const color = grid.cells[cy][cx];
        if (!color) continue;
        const { r, g, b } = hex(color);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(offsetX + cx * CELL, cy * CELL, CELL, CELL);
      }
    }
  });
  const rawPng = canvas.toBuffer('image/png');
  await sharp(rawPng).sharpen({ sigma: 0.5 }).modulate({ saturation: 1.08, brightness: 1.02 }).toFile(outPath);
  console.log(`Wrote ${outPath} (${frameWidth * grids.length}x${frameHeight}, ${grids.length} frames of ${frameWidth}x${frameHeight})`);
}

// ---------- Griffin (evolved from Young Griffin) — bigger, wings spread
// wide instead of folded, a more detailed lion body and eagle head; the
// same lion/eagle palette, just a fuller, more imposing adult shape.
function drawGriffin(bob) {
  const grid = createGrid(GRID, GRID);
  const LION = 0xd9a83c;
  const LION_DARK = 0xa87a1c;
  const LION_LIGHT = 0xf0c868;
  const FEATHER = 0x7a5636;
  const FEATHER_DARK = 0x543a22;
  const BEAK = 0xe8b848;
  const EYE = 0x2a1a0a;
  const TALON = 0x3a2a1a;

  const bodyY = 9 + bob;
  // Wings spread wide FIRST (a grown griffin's own signature, unlike the
  // young form's folded wing) — drawn before the body/head so those sit
  // visibly ON TOP, reading clearly as spread wings behind the creature
  // rather than being lost against it.
  grid.fillRect(0, bodyY - 5, 5, 8, FEATHER);
  grid.fillRect(0, bodyY - 6, 3, 3, FEATHER_DARK);
  grid.fillRect(1, bodyY - 7, 2, 2, FEATHER_DARK);
  grid.fillRect(11, bodyY - 5, 5, 8, FEATHER);
  grid.fillRect(13, bodyY - 6, 3, 3, FEATHER_DARK);
  grid.fillRect(13, bodyY - 7, 2, 2, FEATHER_DARK);
  grid.fillRect(4, bodyY, 8, 5, LION); // body, bigger than the young form
  grid.fillRect(4, bodyY + 1, 8, 1, LION_LIGHT); // highlight band
  grid.fillRect(4, bodyY + 5, 8, 2, LION_DARK); // haunches
  grid.fillRect(3, bodyY + 6, 2, 3, TALON); // front leg
  grid.fillRect(9, bodyY + 6, 2, 3, TALON); // back leg
  grid.fillRect(11, bodyY - 1, 2, 4, LION); // tail
  // Eagle head, bigger and more detailed than the young form.
  grid.fillRect(9, bodyY - 5, 5, 4, FEATHER);
  grid.fillRect(13, bodyY - 4, 2, 2, BEAK);
  grid.set(11, bodyY - 4, EYE);
  return grid;
}
await rasterizeFrameStrip([drawGriffin(0), drawGriffin(-1)], join(ASSETS_DIR, 'pet-griffin-evolved-spritesheet.png'));

// ---------- Phoenix (evolved from Young Phoenix) — bigger, with a full
// flaming tail plume and wide flickering wings, the same fiery-orange
// palette as the young form.
function drawPhoenix(flicker) {
  const grid = createGrid(GRID, GRID);
  const BODY = 0xf08030;
  const BODY_DARK = flicker ? 0xd0451c : 0xc0521c;
  const WING = flicker ? 0xffc030 : 0xff9820;
  const WING_TIP = flicker ? 0xffe080 : 0xffb040;
  const EYE = 0x2a1005;
  const BEAK = 0xffd868;

  const bodyY = 7;
  grid.fillRect(5, bodyY, 7, 6, BODY); // body, bigger than the young form
  // A full flaming tail plume trailing below.
  grid.fillRect(5, bodyY + 6, 7, 3, BODY_DARK);
  grid.fillRect(6, bodyY + 9, 2, 2, WING_TIP);
  grid.fillRect(9, bodyY + 9, 2, 2, WING_TIP);
  // Wide flickering wings, either side.
  grid.fillRect(0, bodyY + 1, 5, 5, WING);
  grid.fillRect(0, bodyY, 2, 2, WING_TIP);
  grid.fillRect(12, bodyY + 1, 5, 5, WING);
  grid.fillRect(14, bodyY, 2, 2, WING_TIP);
  // Head.
  grid.fillRect(7, bodyY - 4, 5, 4, BODY);
  grid.set(10, bodyY - 3, EYE);
  grid.fillRect(11, bodyY - 3, 2, 1, BEAK);
  return grid;
}
await rasterizeFrameStrip([drawPhoenix(false), drawPhoenix(true)], join(ASSETS_DIR, 'pet-phoenix-evolved-spritesheet.png'));

// ---------- Elemental (evolved from Lesser Elemental) — the same
// rainbow hue-rotation cycle the young form uses, at the bigger evolved
// scale with a more defined glowing core.
const RAINBOW = [0xff4d4d, 0xffb84d, 0xfff24d, 0x4dff88, 0x4d9bff, 0xb84dff];

function drawElementalFrame(hueIndex) {
  const grid = createGrid(GRID, GRID);
  const colorAt = (offset) => RAINBOW[(hueIndex + offset) % RAINBOW.length];
  grid.fillRect(5, 3, 6, 2, colorAt(0));
  grid.fillRect(3, 5, 10, 2, colorAt(1));
  grid.fillRect(2, 7, 12, 2, colorAt(2));
  grid.fillRect(3, 9, 10, 2, colorAt(3));
  grid.fillRect(5, 11, 6, 2, colorAt(4));
  // A brighter, more defined glowing core at the center (bigger/more
  // detailed than the young form's plain white dots).
  grid.fillRect(6, 6, 4, 4, 0xffffff);
  grid.set(5, 4, colorAt(5));
  grid.set(10, 4, colorAt(5));
  grid.set(4, 8, 0xffffff);
  grid.set(11, 8, 0xffffff);
  return grid;
}
await rasterizeFrameStrip(
  RAINBOW.map((_, i) => drawElementalFrame(i)),
  join(ASSETS_DIR, 'pet-elemental-evolved-spritesheet.png')
);
