// Grass floor tile, drawn entirely with Canvas 2D vector calls (fills,
// strokes, curves) — no image asset. One tile is generated once, then
// tiled across the whole world with a Phaser TileSprite.
const TILE_SIZE = 32;

// Cheap deterministic pseudo-random so the same tile always looks the
// same (useful while iterating) without reaching for a real RNG library.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function createGrassTexture(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Base
  ctx.fillStyle = '#4c9a4f';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Soft mottling patches — a few translucent darker/lighter blobs so the
  // tile doesn't read as a flat color swatch.
  for (let i = 0; i < 5; i++) {
    const px = pseudoRandom(i * 3 + 1) * TILE_SIZE;
    const py = pseudoRandom(i * 3 + 2) * TILE_SIZE;
    const r = 6 + pseudoRandom(i * 3 + 3) * 5;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(63, 127, 66, 0.35)' : 'rgba(95, 179, 95, 0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, pseudoRandom(i) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Individual blades — short curved strokes, kept a few px from the tile
  // edge so the seam between repeated tiles stays reasonably clean.
  ctx.strokeStyle = '#3f7f42';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const bx = 3 + pseudoRandom(i * 7 + 1) * (TILE_SIZE - 6);
    const by = 6 + pseudoRandom(i * 7 + 2) * (TILE_SIZE - 10);
    const lean = pseudoRandom(i * 7 + 3) > 0.5 ? 2 : -2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lean * 0.5, by - 4, bx + lean, by - 7);
    ctx.stroke();
  }

  // A few brighter tufts on top for a little depth/highlight.
  ctx.fillStyle = '#6fc46a';
  for (let i = 0; i < 4; i++) {
    const bx = 4 + pseudoRandom(i * 11 + 5) * (TILE_SIZE - 8);
    const by = 4 + pseudoRandom(i * 11 + 6) * (TILE_SIZE - 8);
    ctx.beginPath();
    ctx.ellipse(bx, by, 1.6, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  scene.textures.addCanvas(key, canvas);
}

export { TILE_SIZE };
