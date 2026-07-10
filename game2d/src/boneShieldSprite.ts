// A small held-shield icon — same one-shot Canvas 2D draw as
// daggerSprite.ts. Attached as a child sprite on the OPPOSITE arm from
// the weapon overlay whenever a player's shield slot holds an actual
// "bone shield" (not a torch, which fills the same slot but isn't a
// shield — see main.ts's ensureShieldSprite).
const SHIELD_RADIUS_X = 6;
const SHIELD_RADIUS_Y = 7;

export const BONE_SHIELD_TEXTURE_KEY = 'held-bone-shield';

export function createBoneShieldTexture(scene: Phaser.Scene): void {
  const width = 16;
  const height = 16;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cx = width / 2;
  const cy = height / 2;

  // Shield body — pale bone plating.
  ctx.fillStyle = '#e8e0c8';
  ctx.beginPath();
  ctx.ellipse(cx, cy, SHIELD_RADIUS_X, SHIELD_RADIUS_Y, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rim.
  ctx.strokeStyle = '#a89868';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, SHIELD_RADIUS_X, SHIELD_RADIUS_Y, 0, 0, Math.PI * 2);
  ctx.stroke();

  // A central boss plus a rib line, evoking a bone plate.
  ctx.strokeStyle = '#b8a878';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - SHIELD_RADIUS_Y + 1);
  ctx.lineTo(cx, cy + SHIELD_RADIUS_Y - 1);
  ctx.stroke();

  ctx.fillStyle = '#c8bc98';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  scene.textures.addCanvas(BONE_SHIELD_TEXTURE_KEY, canvas);
}
