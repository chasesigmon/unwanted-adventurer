// Applies this session's new Canvas-post-processing pipeline to the
// monster/creature/pet sprites generated THIS batch of work (not the
// pre-existing player-race/NPC/furniture library, which wasn't part of
// "the currently created assets" and would be a much bigger, unrequested
// art-style change to touch) — a black outline for silhouette
// readability against busy grass/cave backgrounds on every creature, plus
// a soft magical glow on the 3 thematically "magical" ones (the coven
// witch, the rune beast's own glowing runes, and the rainbow elemental
// pet). Run with `node tools/optimize-creature-sprites.mjs`.
import { readPNG, writePNG, addOutline, addGlow } from './lib/pixel-post.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const OUTLINE_ONLY = [
  'bear',
  'wolf',
  'moose',
  'falcon',
  'dire-wolf',
  'gobbler',
  'gobbler-necromancer',
  'gobbler-warrior',
  'gobbler-chieftain',
  'troll',
  'woodland-fairy',
  'pet-griffin',
  'pet-phoenix',
];

const OUTLINE_AND_GLOW = [
  { name: 'coven-witch', color: [140, 90, 220] },
  { name: 'rune-beast', color: [102, 224, 232] },
  { name: 'pet-elemental', color: [255, 255, 255] },
];

let totalBefore = 0;
let totalAfter = 0;

for (const name of OUTLINE_ONLY) {
  const path = join(ASSETS_DIR, `${name}-spritesheet.png`);
  const before = statSync(path).size;
  const sprite = readPNG(path);
  const outlined = addOutline(sprite, { color: [10, 10, 10, 255], alphaThreshold: 32 });
  writePNG(path, outlined);
  const after = statSync(path).size;
  totalBefore += before;
  totalAfter += after;
  console.log(`outline: ${name} (${before}B -> ${after}B)`);
}

for (const { name, color } of OUTLINE_AND_GLOW) {
  const path = join(ASSETS_DIR, `${name}-spritesheet.png`);
  const before = statSync(path).size;
  const sprite = readPNG(path);
  const glowed = addGlow(sprite, { color, radius: 3, intensity: 0.55 });
  const outlined = addOutline(glowed, { color: [10, 10, 10, 255], alphaThreshold: 32 });
  writePNG(path, outlined);
  const after = statSync(path).size;
  totalBefore += before;
  totalAfter += after;
  console.log(`outline+glow: ${name} (${before}B -> ${after}B)`);
}

console.log(`\nPixel-post total: ${totalBefore}B -> ${totalAfter}B`);
