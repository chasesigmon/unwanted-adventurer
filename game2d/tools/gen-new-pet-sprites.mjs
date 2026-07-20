// Pixel-art generator for item 15's 3 new Kortho-only pet-shop pets:
// young griffin, lesser elemental, young phoenix. Same "big pixel" grid
// technique as tools/gen-pet-evolved-assets.mjs, but at the ORIGINAL
// (un-evolved) pet frame size — 24x24, CELL=2 (12x12 grid) — "their size
// should be the same as the basic pets from Bramwick" (the un-evolved
// puppy/kitten/piglet, not the bigger 32x32 evolved forms).
//
// All 3 "fly next to the player" (see WorldScene's own FLYING_MONSTER_Y_OFFSET
// hover applied to these 3 kinds) — the sprite art itself doesn't need to
// imply flight beyond wings, since the hover offset does that work.
//
// The elemental gets 6 frames (not 2) for a real rainbow hue-rotation
// loop — "many more colors like a rainbow that are pulsating/flickering/
// rotating" — played as a proper looping Phaser animation (see
// WorldScene's own petAnimKeyFor), unlike every other pet's plain static
// single frame. Griffin/phoenix get the ordinary 2-frame idle-bob shape.
//
// Run with `node tools/gen-new-pet-sprites.mjs` from game2d/; requires
// the `pngjs` devDependency (already installed for the other gen-*.mjs
// scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 2;
const GRID = 12; // 12x12 cells * 2px = 24x24 per frame

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function createGrid() {
  const cells = Array.from({ length: GRID }, () => new Array(GRID).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < GRID && xx >= 0 && xx < GRID) cells[yy][xx] = color;
        }
      }
    },
    set(x, y, color) {
      if (y >= 0 && y < GRID && x >= 0 && x < GRID) cells[y][x] = color;
    },
  };
}

function rasterizeSpritesheet(grids, outPath) {
  const frameWidth = GRID * CELL;
  const frameHeight = GRID * CELL;
  const png = new PNG({ width: frameWidth * grids.length, height: frameHeight });
  png.data.fill(0);

  grids.forEach((grid, frameIndex) => {
    const offsetX = frameIndex * frameWidth;
    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const color = grid.cells[cy][cx];
        if (!color) continue;
        const { r, g, b } = hex(color);
        for (let py = 0; py < CELL; py++) {
          for (let px = 0; px < CELL; px++) {
            const x = offsetX + cx * CELL + px;
            const y = cy * CELL + py;
            const idx = (frameWidth * grids.length * y + x) << 2;
            png.data[idx] = r;
            png.data[idx + 1] = g;
            png.data[idx + 2] = b;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  });

  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${frameWidth * grids.length}x${frameHeight}, ${grids.length} frames of ${frameWidth}x${frameHeight})`);
}

// ---------- Young Griffin — "a creature which combines the features of
// lion and eagle": a tawny lion body/legs/tail, an eagle head with a
// curved beak and folded wings.
function drawGriffin(bob) {
  const grid = createGrid();
  const LION = 0xc9962c;
  const LION_DARK = 0x9c701c;
  const FEATHER = 0x6b4a2a;
  const BEAK = 0xe0a838;
  const EYE = 0x2a1a0a;

  const bodyY = 5 + bob;
  grid.fillRect(3, bodyY, 6, 4, LION); // body
  grid.fillRect(3, bodyY + 4, 6, 2, LION_DARK); // legs
  grid.fillRect(1, bodyY + 1, 2, 3, FEATHER); // folded wing
  grid.fillRect(8, bodyY - 1, 1, 3, LION); // tail
  // Eagle head.
  grid.fillRect(7, bodyY - 3, 4, 3, FEATHER);
  grid.fillRect(10, bodyY - 2, 2, 1, BEAK);
  grid.set(9, bodyY - 2, EYE);
  return grid;
}
rasterizeSpritesheet([drawGriffin(0), drawGriffin(-1)], join(ASSETS_DIR, 'pet-griffin-spritesheet.png'));

// ---------- Young Phoenix — "slightly fiery/orange-ish bird."
function drawPhoenix(flicker) {
  const grid = createGrid();
  const BODY = 0xe8752c;
  const BODY_DARK = flicker ? 0xc23a1a : 0xb84a1a;
  const WING = flicker ? 0xffb020 : 0xff8c1a;
  const EYE = 0x2a1005;
  const BEAK = 0xffd060;

  grid.fillRect(4, 4, 5, 5, BODY); // body
  grid.fillRect(4, 9, 5, 2, BODY_DARK); // tail feathers
  grid.fillRect(1, 5, 3, 3, WING); // wing, flickers between frames
  grid.fillRect(8, 5, 2, 2, WING);
  grid.fillRect(6, 2, 3, 3, BODY); // head
  grid.set(8, 3, EYE);
  grid.fillRect(9, 3, 1, 1, BEAK);
  return grid;
}
rasterizeSpritesheet([drawPhoenix(false), drawPhoenix(true)], join(ASSETS_DIR, 'pet-phoenix-spritesheet.png'));

// ---------- Lesser Elemental — "look similar to wisp transformation,
// except have many more colors like a rainbow that are pulsating/
// flickering/rotating throughout the sprite." 6 frames, each a
// different point in a hue rotation, meant to be played as a real
// looping animation (see WorldScene's own petAnimKeyFor) rather than a
// static single frame like every other pet.
const RAINBOW = [0xff4d4d, 0xffb84d, 0xfff24d, 0x4dff88, 0x4d9bff, 0xb84dff];

function drawElementalFrame(hueIndex) {
  const grid = createGrid();
  const colorAt = (offset) => RAINBOW[(hueIndex + offset) % RAINBOW.length];
  // A roughly wisp-shaped blob — soft rounded core, no limbs — built from
  // concentric-ish bands each taking the NEXT color in the rotation, so
  // the whole thing visibly cycles through the rainbow frame to frame.
  grid.fillRect(4, 3, 4, 2, colorAt(0));
  grid.fillRect(3, 5, 6, 2, colorAt(1));
  grid.fillRect(3, 7, 6, 2, colorAt(2));
  grid.fillRect(4, 9, 4, 2, colorAt(3));
  grid.set(4, 4, colorAt(4));
  grid.set(8, 4, colorAt(5));
  grid.set(5, 6, 0xffffff);
  grid.set(7, 8, 0xffffff);
  return grid;
}
rasterizeSpritesheet(
  RAINBOW.map((_, i) => drawElementalFrame(i)),
  join(ASSETS_DIR, 'pet-elemental-spritesheet.png')
);
