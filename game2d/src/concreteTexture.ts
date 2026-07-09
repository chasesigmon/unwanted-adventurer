// The town floor (Floro/Kortho) — same one-tile-then-repeat Canvas 2D
// approach as grass/stone (see grassTexture.ts/stoneTexture.ts), but a
// regular poured-concrete paver grid rather than the Labyrinth's
// irregular flagstone, so towns read as distinctly different ground even
// though both are "stone/concrete" colored.
import { TILE_SIZE } from './grassTexture.js';

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 45.164) * 43758.5453;
  return x - Math.floor(x);
}

export function createConcreteTexture(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Base — a cooler, lighter grey than the Labyrinth's stone.
  ctx.fillStyle = '#9a9d9f';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // A regular paver seam down the right and bottom edges of every tile —
  // tiling these repeats into a clean, even grid (poured slabs), the
  // opposite feel of the Labyrinth's irregular mortar lines.
  ctx.strokeStyle = '#7a7d80';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(TILE_SIZE - 0.5, 0);
  ctx.lineTo(TILE_SIZE - 0.5, TILE_SIZE);
  ctx.moveTo(0, TILE_SIZE - 0.5);
  ctx.lineTo(TILE_SIZE, TILE_SIZE - 0.5);
  ctx.stroke();

  // A faint inner highlight so the slab doesn't read as one flat fill.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);

  // Small dark speckles for wear/texture.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 5; i++) {
    const px = pseudoRandom(i * 7 + 1) * TILE_SIZE;
    const py = pseudoRandom(i * 7 + 2) * TILE_SIZE;
    const r = 0.6 + pseudoRandom(i * 7 + 3) * 1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  scene.textures.addCanvas(key, canvas);
}
