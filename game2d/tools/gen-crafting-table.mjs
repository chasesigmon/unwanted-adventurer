// A later follow-up ask: "Add a 'Crafting Shop'... create a crafting
// table on the right wall of each Crafting Shop... create a good looking
// sprite for it." Same canvas+sharp static-prop pipeline as
// gen-runestone-canyon-tiles.mjs (see tools/lib/spriteCanvas.mjs) — a
// plain top-down 2x2-tile workbench (matching the bench/long-table
// convention of "one static image, no animation states"), with a hammer,
// a small gem, and a vial-in-a-rack drawn on top for flavor so it reads
// as a crafting station rather than a plain dining table.
//
// Run with `node tools/gen-crafting-table.mjs` from game2d/.
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createGrid, rasterizeSingleImage } from './lib/spriteCanvas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 4;
const COLS = 16; // 2 tiles wide at TILE_SIZE=32
const ROWS = 16; // 2 tiles tall

const WOOD_TOP = 0x8a5a34;
const WOOD_MID = 0x6f4526;
const WOOD_DARK = 0x4a2d18;
const WOOD_EDGE = 0x2e1a0d;
const METAL = 0x9aa0a6;
const METAL_DARK = 0x5a6066;
const GEM = 0x5ec8e8;
const GEM_DARK = 0x2a7fa0;
const VIAL_GLASS = 0xcfe8e0;
const VIAL_LIQUID = 0x8a2020;

function buildCraftingTable() {
  const grid = createGrid(COLS, ROWS);

  // Tabletop — a wide wooden slab with a darker border/edge shading.
  grid.fillRect(0, 1, COLS, ROWS - 2, WOOD_EDGE);
  grid.fillRect(1, 2, COLS - 2, ROWS - 4, WOOD_MID);
  grid.fillRect(2, 3, COLS - 4, ROWS - 6, WOOD_TOP);
  // A few plank-seam lines for texture.
  for (let x = 3; x < COLS - 3; x += 4) grid.fillRect(x, 3, 1, ROWS - 6, WOOD_DARK);

  // Front (south) apron/legs, read as depth under the tabletop.
  grid.fillRect(1, ROWS - 3, COLS - 2, 2, WOOD_DARK);
  grid.fillRect(2, ROWS - 1, 2, 1, WOOD_EDGE);
  grid.fillRect(COLS - 4, ROWS - 1, 2, 1, WOOD_EDGE);

  // A small anvil-ish hammer on the left side of the table (handle +
  // head), viewed from above.
  grid.fillRect(3, 6, 1, 5, WOOD_DARK); // handle
  grid.fillRect(2, 5, 3, 2, METAL_DARK); // head
  grid.fillRect(2, 5, 3, 1, METAL);

  // A cut gem, center-right — the "focus gem" crafting material this
  // shop sells, echoed here as a decorative touch.
  grid.set(9, 6, GEM_DARK);
  grid.fillRect(9, 7, 2, 2, GEM);
  grid.set(10, 9, GEM_DARK);

  // A small vial rack on the right edge — 2 vials standing upright.
  grid.fillRect(12, 5, 1, 4, VIAL_GLASS);
  grid.fillRect(12, 7, 1, 2, VIAL_LIQUID);
  grid.fillRect(13, 5, 1, 4, VIAL_GLASS);

  return grid;
}

await rasterizeSingleImage(buildCraftingTable(), CELL, COLS, ROWS, join(ASSETS_DIR, 'crafting-table.png'));
