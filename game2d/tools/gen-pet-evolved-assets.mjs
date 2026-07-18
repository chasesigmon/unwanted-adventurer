// One-time pixel-art generator for each pet's own EVOLVED form (a later
// follow-up ask: "at level 5 they evolve into a more mature form. Create
// a sprite that is slightly larger and modelled differently for each
// respective pet" — the evolution mechanic itself already existed
// (PET_EVOLUTION_LEVEL/PET_EVOLVED_NAME) but reused the un-evolved pet's
// own spritesheet with no new art; this generates the real, distinct art
// that ask actually wants). Same coarse "big pixel" grid technique
// tools/gen-shop-assets.mjs uses (no Aseprite/pixel-mcp available in this
// environment) — a bigger canvas AND a bigger grid than the original
// 24x24/2px-cell pet sprites (32x32 at 2px/cell, i.e. a 16x16 grid, vs.
// the original's implied ~12x12), so each evolved form reads as
// genuinely larger, not just rescaled.
//
// Run once with `node tools/gen-pet-evolved-assets.mjs` from game2d/
// whenever the art needs regenerating.
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 2;
const GRID = 16; // 16x16 cells * 2px = 32x32 per frame

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

// ---------- Dog (puppy's evolved form) — bigger body, erect adult ears
// (not floppy), a longer snout, and a collar; a richer, darker brown than
// the puppy's own lighter tan. ----------
const DOG_BODY = 0x8a6338;
const DOG_BODY_DARK = 0x6b4a26;
const DOG_SNOUT = 0xc9a06a;
const DOG_EAR = 0x4a3218;
const DOG_COLLAR = 0xb03a3a;
const BLACK = 0x1a1410;

function buildDogFrame(bob) {
  const g = createGrid();
  const y0 = bob;
  // Erect ears (triangular, standing up — not floppy).
  g.fillRect(2, y0, 3, 4, DOG_EAR);
  g.fillRect(11, y0, 3, 4, DOG_EAR);
  // Head.
  g.fillRect(3, y0 + 2, 10, 6, DOG_BODY);
  // Snout, longer/more adult than the puppy's own compact muzzle.
  g.fillRect(5, y0 + 5, 6, 3, DOG_SNOUT);
  g.set(6, y0 + 6, BLACK);
  g.set(9, y0 + 6, BLACK);
  g.fillRect(6, y0 + 7, 4, 1, BLACK);
  // Body — noticeably bigger footprint than the puppy's own.
  g.fillRect(2, y0 + 8, 12, 6, DOG_BODY);
  g.fillRect(2, y0 + 12, 3, 3, DOG_BODY_DARK);
  g.fillRect(11, y0 + 12, 3, 3, DOG_BODY_DARK);
  // Collar.
  g.fillRect(3, y0 + 8, 10, 1, DOG_COLLAR);
  // Tail, wagging pose.
  g.fillRect(14, y0 + 7 - bob, 2, 4, DOG_BODY);
  return g;
}

rasterizeSpritesheet([buildDogFrame(0), buildDogFrame(1)], join(ASSETS_DIR, 'pet-dog-spritesheet.png'));

// ---------- Cat (kitten's evolved form) — sleeker/longer body than the
// kitten's own round one, more angular ears, a longer curled tail, and a
// darker, more contrasted coat (faint stripes). ----------
const CAT_BODY = 0x6f6f78;
const CAT_BODY_DARK = 0x54545c;
const CAT_STRIPE = 0x45454c;
const CAT_EYE = 0x3fae6e;
const CAT_NOSE = 0xe0a0a8;

function buildCatFrame(bob) {
  const g = createGrid();
  const y0 = bob;
  // Sharper, more angular ears than the kitten's own rounded tufts.
  g.fillRect(3, y0, 2, 3, CAT_BODY_DARK);
  g.fillRect(11, y0, 2, 3, CAT_BODY_DARK);
  // Head.
  g.fillRect(3, y0 + 2, 10, 5, CAT_BODY);
  g.set(5, y0 + 4, CAT_EYE);
  g.set(10, y0 + 4, CAT_EYE);
  g.fillRect(7, y0 + 5, 2, 1, CAT_NOSE);
  // Body — longer/sleeker than the kitten's own round silhouette.
  g.fillRect(2, y0 + 7, 12, 5, CAT_BODY);
  for (let x = 3; x < 14; x += 3) g.fillRect(x, y0 + 8, 1, 3, CAT_STRIPE);
  g.fillRect(2, y0 + 12, 3, 3, CAT_BODY_DARK);
  g.fillRect(11, y0 + 12, 3, 3, CAT_BODY_DARK);
  // Long curled tail.
  g.fillRect(14, y0 + 6, 2, 5, CAT_BODY);
  g.fillRect(13, y0 + 4 - bob, 2, 3, CAT_BODY);
  return g;
}

rasterizeSpritesheet([buildCatFrame(0), buildCatFrame(1)], join(ASSETS_DIR, 'pet-cat-spritesheet.png'));

// ---------- Boar (piglet's evolved form) — bigger and tougher than the
// pink piglet: a darker hide, a bristly dark mane down the back, and a
// pair of visible tusks. ----------
const BOAR_BODY = 0x8a6a5a;
const BOAR_BODY_DARK = 0x6b4d40;
const BOAR_MANE = 0x2a2320;
const BOAR_TUSK = 0xe8e0c8;

function buildBoarFrame(bob) {
  const g = createGrid();
  const y0 = bob;
  // Ears.
  g.fillRect(3, y0 + 1, 3, 3, BOAR_BODY_DARK);
  g.fillRect(10, y0 + 1, 3, 3, BOAR_BODY_DARK);
  // Head, broader/tougher than the piglet's own small rounded one.
  g.fillRect(3, y0 + 3, 10, 5, BOAR_BODY);
  g.set(5, y0 + 5, BLACK);
  g.set(10, y0 + 5, BLACK);
  g.fillRect(6, y0 + 7, 4, 2, BOAR_BODY_DARK);
  // Body — bigger and sturdier than the piglet's own.
  g.fillRect(2, y0 + 8, 12, 6, BOAR_BODY);
  g.fillRect(2, y0 + 13, 3, 2, BOAR_BODY_DARK);
  g.fillRect(11, y0 + 13, 3, 2, BOAR_BODY_DARK);
  // Bristly mane down the spine — the piglet has none of this.
  g.fillRect(6, y0 + 2, 1, 7, BOAR_MANE);
  g.fillRect(8, y0 + 2, 1, 7, BOAR_MANE);
  g.fillRect(10, y0 + 3, 1, 6, BOAR_MANE);
  // Tusks, curving out from the snout — drawn LAST so they sit on top of
  // (not underneath) the body/head fills above.
  g.set(4, y0 + 7, BOAR_TUSK);
  g.set(11, y0 + 7, BOAR_TUSK);
  return g;
}

rasterizeSpritesheet([buildBoarFrame(0), buildBoarFrame(1)], join(ASSETS_DIR, 'pet-boar-spritesheet.png'));
