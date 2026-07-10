// A small wall-mounted torch — a bracket holding a stick with a flame on
// top, drawn once as a Canvas 2D texture (same one-shot approach as
// daggerSprite.ts/boneShieldSprite.ts). Purely decorative (see
// shared/lighting.ts's torchWallPositionsFor) — main.ts adds a gentle
// flicker tween on top of the static texture rather than animating frames.
export const WALL_TORCH_TEXTURE_KEY = 'wall-torch';

export function createWallTorchTexture(scene: Phaser.Scene): void {
  const width = 16;
  const height = 20;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = width / 2;

  // Iron wall bracket.
  ctx.strokeStyle = '#4a4238';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, height - 2);
  ctx.lineTo(cx, height - 8);
  ctx.stroke();

  // Wooden handle.
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(cx - 1.5, height - 16, 3, 10);

  // Flame — a warm core inside a brighter tip.
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.ellipse(cx, height - 16, 4.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.ellipse(cx, height - 17, 2.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  scene.textures.addCanvas(WALL_TORCH_TEXTURE_KEY, canvas);
}
