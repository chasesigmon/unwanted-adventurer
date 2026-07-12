// Pixel-art generator for the two spell/attack projectiles (a follow-up
// ask: "create a fireball animation that shoots at the target when augue
// is cast" / "create an animation for [the wand's ranged auto-attack]")
// — same no-Aseprite/pixel-mcp constraint, coarse "big pixel" grid
// rasterized to a real static PNG via pngjs, as every other simple asset
// here. Each is drawn pointing EAST by default — WorldScene rotates the
// sprite to face wherever it's actually travelling (see its own
// playProjectileEffect).
//
// Run with `node tools/gen-projectiles.mjs` from game2d/; requires the
// `pngjs` devDependency (already installed for the other gen-*.mjs
// scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function createGrid(size) {
  const cells = Array.from({ length: size }, () => new Array(size).fill(null));
  return {
    cells,
    fillCircle(cx, cy, radius, color) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) cells[y][x] = color;
        }
      }
    },
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < size && xx >= 0 && xx < size) cells[yy][xx] = color;
        }
      }
    },
  };
}

function rasterize(grid, size, cell, outPath) {
  const png = new PNG({ width: size * cell, height: size * cell });
  png.data.fill(0);
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const color = grid.cells[cy][cx];
      if (!color) continue;
      const { r, g, b } = hex(color);
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const x = cx * cell + px;
          const y = cy * cell + py;
          const idx = (size * cell * y + x) << 2;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${size * cell}x${size * cell})`);
}

// A small glowing orange/red fireball — augue's own projectile.
const FIREBALL_SIZE = 10;
const FIREBALL_CELL = 3;
function buildFireball() {
  const grid = createGrid(FIREBALL_SIZE);
  const c = FIREBALL_SIZE / 2;
  grid.fillCircle(c, c, 4.6, 0x7a1a08); // outer ember
  grid.fillCircle(c, c, 3.4, 0xd94a1e); // mid flame
  grid.fillCircle(c, c, 2, 0xf2c040); // bright core
  return grid;
}
rasterize(buildFireball(), FIREBALL_SIZE, FIREBALL_CELL, join(ASSETS_DIR, 'fireball.png'));

// A small magic bolt (an elongated diamond, like a stylized arrow of
// light) — the wand's own ranged auto-attack projectile.
const BOLT_SIZE = 10;
const BOLT_CELL = 3;
function buildBolt() {
  const grid = createGrid(BOLT_SIZE);
  const midY = Math.floor(BOLT_SIZE / 2);
  // A tapered elongated shape pointing east.
  grid.fillRect(0, midY, 4, 1, 0x8ab8e8);
  grid.fillRect(4, midY - 1, 4, 3, 0xcfe6ff);
  grid.fillRect(8, midY, 2, 1, 0xffffff);
  return grid;
}
rasterize(buildBolt(), BOLT_SIZE, BOLT_CELL, join(ASSETS_DIR, 'bolt.png'));
