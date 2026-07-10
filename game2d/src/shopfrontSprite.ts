// A small market stall — striped awning, wooden counter, corner posts —
// drawn once with Canvas 2D vector calls, same one-shot approach as
// doorSprite.ts. Placed directly in front of (one tile south of) every
// vendor (see main.ts's applyMapState); purely decorative, never
// interactive — the shopkeeper sprite standing behind it is the actual
// click target.
const SHOPFRONT_WIDTH = 40;
const SHOPFRONT_HEIGHT = 36;

export function createShopfrontTexture(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = SHOPFRONT_WIDTH;
  canvas.height = SHOPFRONT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Corner posts.
  ctx.fillStyle = '#5c4326';
  ctx.fillRect(2, 10, 4, SHOPFRONT_HEIGHT - 10);
  ctx.fillRect(SHOPFRONT_WIDTH - 6, 10, 4, SHOPFRONT_HEIGHT - 10);

  // Striped awning.
  const stripeCount = 6;
  const stripeWidth = SHOPFRONT_WIDTH / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#8a2e2e' : '#d8cfa8';
    ctx.beginPath();
    ctx.moveTo(i * stripeWidth, 0);
    ctx.lineTo((i + 1) * stripeWidth, 0);
    ctx.lineTo((i + 1) * stripeWidth - 3, 10);
    ctx.lineTo(i * stripeWidth + 3, 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(0, 8, SHOPFRONT_WIDTH, 3);

  // Wooden counter.
  ctx.fillStyle = '#8a6a3e';
  ctx.fillRect(0, SHOPFRONT_HEIGHT - 14, SHOPFRONT_WIDTH, 14);
  ctx.strokeStyle = '#5c4326';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, SHOPFRONT_HEIGHT - 14, SHOPFRONT_WIDTH, 14);
  for (let x = 6; x < SHOPFRONT_WIDTH; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, SHOPFRONT_HEIGHT - 14);
    ctx.lineTo(x, SHOPFRONT_HEIGHT);
    ctx.stroke();
  }

  scene.textures.addCanvas(key, canvas);
}

export { SHOPFRONT_WIDTH, SHOPFRONT_HEIGHT };
