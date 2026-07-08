// The Labyrinth's floor — same "draw one tile with Canvas 2D vector
// calls, then tile it" approach as the grass floor (see grassTexture.ts),
// just stone-colored: a flagstone look (irregular mortar-line patches)
// rather than perfectly regular brick coursing, since a single repeating
// tile forgives an irregular pattern far better than an aligned one.
import { TILE_SIZE } from './grassTexture.js';

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 78.233) * 96712.734;
  return x - Math.floor(x);
}

export function createStoneTexture(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Base.
  ctx.fillStyle = '#6d7176';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Mortar lines splitting the tile into a few irregular flagstone
  // sections.
  ctx.strokeStyle = '#4a4d51';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(18, 15);
  ctx.lineTo(TILE_SIZE, 13);
  ctx.moveTo(16, 0);
  ctx.lineTo(15, 14);
  ctx.moveTo(16, 15);
  ctx.lineTo(17, TILE_SIZE);
  ctx.stroke();

  // Shading patches so each flagstone section reads as a slightly
  // different slab, not one flat fill.
  const patches: [number, number, number, number, string][] = [
    [0, 0, 16, 14, 'rgba(255,255,255,0.05)'],
    [16, 0, 16, 15, 'rgba(0,0,0,0.06)'],
    [0, 15, 15, TILE_SIZE - 15, 'rgba(0,0,0,0.05)'],
    [16, 14, TILE_SIZE - 16, TILE_SIZE - 14, 'rgba(255,255,255,0.04)'],
  ];
  for (const [x, y, w, h, color] of patches) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // Small dark speckles for wear/texture.
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 6; i++) {
    const px = pseudoRandom(i * 5 + 1) * TILE_SIZE;
    const py = pseudoRandom(i * 5 + 2) * TILE_SIZE;
    const r = 0.8 + pseudoRandom(i * 5 + 3) * 1.2;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  scene.textures.addCanvas(key, canvas);
}
