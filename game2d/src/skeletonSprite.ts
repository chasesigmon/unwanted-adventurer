// The skeleton — same three-directional-sheet approach as the goblin
// (see goblinSprite.ts), but bone-colored, with a ribcage instead of a
// tunic, eye sockets instead of eyes, and no ears. Static for now (see
// main.ts, which just stands one at the center of the map), but it's
// built with the full walking set so giving it actual movement later is
// just a matter of driving it the same way the player is driven.
import { FRAME_WIDTH, FRAME_HEIGHT, buildWalkSpriteSheet, buildWalkAnimation, swingFor } from './spriteSheetBuilder.js';

const BONE = '#e8e4d8';
const BONE_SHADOW = '#c9c3ac';
const SOCKET = '#2b2620';

// ---- Down (facing the camera) ----
function drawDownFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 25;
  const originY = 15;
  const width = 60;
  const swing = swingFor(phase, 7);

  ctx.save();

  // Legs.
  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX + 16 + swing, originY + 92, 8, 26);
  ctx.fillRect(originX + width - 24 - swing, originY + 92, 8, 26);
  // Knee joints.
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX + 20 + swing, originY + 92, 4, 0, Math.PI * 2);
  ctx.arc(originX + width - 20 - swing, originY + 92, 4, 0, Math.PI * 2);
  ctx.fill();

  // Arms.
  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX - 6, originY + 64 - swing * 0.6, 8, 32);
  ctx.fillRect(originX + width - 2, originY + 64 + swing * 0.6, 8, 32);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX - 2, originY + 64 - swing * 0.6, 3.5, 0, Math.PI * 2);
  ctx.arc(originX + width + 2, originY + 64 + swing * 0.6, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Skull.
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX + width / 2, originY + 38, 24, 0, Math.PI * 2);
  ctx.fill();

  // Eye sockets.
  ctx.fillStyle = SOCKET;
  ctx.beginPath();
  ctx.ellipse(originX + 20, originY + 36, 5, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(originX + 40, originY + 36, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nasal cavity.
  ctx.beginPath();
  ctx.moveTo(originX + width / 2 - 3, originY + 44);
  ctx.lineTo(originX + width / 2 + 3, originY + 44);
  ctx.lineTo(originX + width / 2, originY + 52);
  ctx.fill();

  // Jaw line with a few teeth gaps.
  ctx.fillRect(originX + 17, originY + 56, 26, 4);
  ctx.fillStyle = BONE;
  for (let t = 0; t < 4; t++) {
    ctx.fillRect(originX + 20 + t * 6, originY + 56, 2, 4);
  }

  // Ribcage.
  ctx.fillStyle = BONE;
  ctx.fillRect(originX + 14, originY + 65, 32, 30);
  ctx.strokeStyle = SOCKET;
  ctx.lineWidth = 2;
  for (let r = 0; r < 4; r++) {
    const ry = originY + 71 + r * 6;
    ctx.beginPath();
    ctx.moveTo(originX + 17, ry);
    ctx.lineTo(originX + 43, ry);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(originX + width / 2, originY + 65);
  ctx.lineTo(originX + width / 2, originY + 95);
  ctx.stroke();

  ctx.restore();
}

// ---- Up (back) ----
function drawUpFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 25;
  const originY = 15;
  const width = 60;
  const swing = swingFor(phase, 7);

  ctx.save();

  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX + 16 + swing, originY + 92, 8, 26);
  ctx.fillRect(originX + width - 24 - swing, originY + 92, 8, 26);
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX + 20 + swing, originY + 92, 4, 0, Math.PI * 2);
  ctx.arc(originX + width - 20 - swing, originY + 92, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX - 6, originY + 64 - swing * 0.6, 8, 32);
  ctx.fillRect(originX + width - 2, originY + 64 + swing * 0.6, 8, 32);

  // Back of skull — no face at all.
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX + width / 2, originY + 38, 24, 0, Math.PI * 2);
  ctx.fill();

  // Spine — a stack of small vertebrae down the back.
  ctx.fillStyle = BONE;
  for (let v = 0; v < 5; v++) {
    ctx.beginPath();
    ctx.ellipse(originX + width / 2, originY + 68 + v * 6, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = SOCKET;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ---- Side (profile, facing left) ----
function drawSideFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 45;
  const originY = 15;
  const swing = swingFor(phase, 8);

  ctx.save();

  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX - 6 - swing, originY + 92, 8, 27);
  ctx.fillRect(originX - 6 + swing, originY + 92, 8, 27);

  ctx.fillStyle = BONE_SHADOW;
  ctx.fillRect(originX - 10 - swing, originY + 64, 8, 30);

  // Skull.
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(originX, originY + 38, 23, 0, Math.PI * 2);
  ctx.fill();

  // Single eye socket.
  ctx.fillStyle = SOCKET;
  ctx.beginPath();
  ctx.ellipse(originX - 8, originY + 35, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Protruding jaw, in place of the goblin's fleshy nose.
  ctx.beginPath();
  ctx.moveTo(originX - 20, originY + 46);
  ctx.lineTo(originX - 2, originY + 40);
  ctx.lineTo(originX - 2, originY + 54);
  ctx.fill();
  ctx.fillStyle = BONE;
  ctx.fillRect(originX - 16, originY + 48, 12, 3);

  // Ribcage, side view.
  ctx.fillStyle = BONE;
  ctx.fillRect(originX - 18, originY + 64, 24, 28);
  ctx.strokeStyle = SOCKET;
  ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    const ry = originY + 70 + r * 7;
    ctx.beginPath();
    ctx.moveTo(originX - 16, ry);
    ctx.lineTo(originX + 4, ry);
    ctx.stroke();
  }

  ctx.restore();
}

export const SKELETON_TEXTURES = {
  down: 'skeleton-down',
  up: 'skeleton-up',
  side: 'skeleton-side',
} as const;

export const SKELETON_ANIMS = {
  down: 'skeleton-walk-down',
  up: 'skeleton-walk-up',
  side: 'skeleton-walk-side',
} as const;

export function createSkeletonSprites(scene: Phaser.Scene): void {
  buildWalkSpriteSheet(scene, SKELETON_TEXTURES.down, drawDownFrame);
  buildWalkSpriteSheet(scene, SKELETON_TEXTURES.up, drawUpFrame);
  buildWalkSpriteSheet(scene, SKELETON_TEXTURES.side, drawSideFrame);

  buildWalkAnimation(scene, SKELETON_ANIMS.down, SKELETON_TEXTURES.down);
  buildWalkAnimation(scene, SKELETON_ANIMS.up, SKELETON_TEXTURES.up);
  buildWalkAnimation(scene, SKELETON_ANIMS.side, SKELETON_TEXTURES.side);
}

export { FRAME_WIDTH, FRAME_HEIGHT };
