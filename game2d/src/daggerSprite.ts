// A small held-weapon icon — same one-shot Canvas 2D draw as the other
// procedural textures (grass/stone/concrete/tree). Attached as a child
// sprite next to a character's hand whenever their weapon slot is filled
// (see main.ts's ensureWeaponSprite) — not aligned per animation frame,
// just a fixed offset per facing direction, a reasonable "holding a
// dagger" cue without needing a whole new rigged spritesheet.
const BLADE_LENGTH = 14;
const BLADE_WIDTH = 4;

export const DAGGER_TEXTURE_KEY = 'held-dagger';

export function createDaggerTexture(scene: Phaser.Scene): void {
  const width = 16;
  const height = 16;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = width / 2;
  const cy = height / 2;

  // Blade.
  ctx.fillStyle = '#d8d8dc';
  ctx.beginPath();
  ctx.moveTo(cx, cy - BLADE_LENGTH / 2);
  ctx.lineTo(cx + BLADE_WIDTH / 2, cy - BLADE_LENGTH / 2 + 4);
  ctx.lineTo(cx + BLADE_WIDTH / 2, cy + 2);
  ctx.lineTo(cx - BLADE_WIDTH / 2, cy + 2);
  ctx.lineTo(cx - BLADE_WIDTH / 2, cy - BLADE_LENGTH / 2 + 4);
  ctx.closePath();
  ctx.fill();

  // Guard.
  ctx.fillStyle = '#7a6a4a';
  ctx.fillRect(cx - 4, cy + 2, 8, 2);

  // Bone handle.
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(cx - 1.5, cy + 4, 3, 5);

  scene.textures.addCanvas(DAGGER_TEXTURE_KEY, canvas);
}
