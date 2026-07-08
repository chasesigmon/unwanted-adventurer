// The goblin, drawn with plain Canvas 2D vector calls — three separate
// directional sheets (down/up/side) so turning to face a direction
// actually shows that side of the character, not just the same front
// view sliding around. Left and right share the "side" sheet — the
// caller flips the sprite horizontally for right-facing (see main.ts) —
// since a hand-drawn mirror image would be identical work for no benefit.
import { FRAME_WIDTH, FRAME_HEIGHT, buildWalkSpriteSheet, buildWalkAnimation, swingFor } from './spriteSheetBuilder.js';

const GREEN = '#3b7a57';
const DARK_GREEN = '#2e5e43';
const TUNIC = '#1e3f28';
const EYE_YELLOW = '#ffcc00';

// ---- Down (facing the camera) ----
function drawDownFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 25;
  const originY = 15;
  const width = 60;
  const swing = swingFor(phase, 7);

  ctx.save();

  // Legs (both visible, swinging opposite each other).
  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX + 12 + swing, originY + 92, 11, 26);
  ctx.fillRect(originX + width - 23 - swing, originY + 92, 11, 26);

  // Arms — swing opposite their same-side leg.
  ctx.fillStyle = GREEN;
  ctx.fillRect(originX - 8, originY + 62 - swing * 0.6, 11, 34);
  ctx.fillRect(originX + width - 3, originY + 62 + swing * 0.6, 11, 34);

  // Pointy ears.
  ctx.beginPath();
  ctx.moveTo(originX, originY + 20);
  ctx.lineTo(originX - 20, originY);
  ctx.lineTo(originX, originY + 40);
  ctx.moveTo(originX + width, originY + 20);
  ctx.lineTo(originX + width + 20, originY);
  ctx.lineTo(originX + width, originY + 40);
  ctx.fill();

  // Head.
  ctx.beginPath();
  ctx.arc(originX + width / 2, originY + 40, 25, 0, Math.PI * 2);
  ctx.fill();

  // Nose.
  ctx.fillStyle = DARK_GREEN;
  ctx.beginPath();
  ctx.moveTo(originX + width / 2 - 5, originY + 35);
  ctx.lineTo(originX + width / 2, originY + 20);
  ctx.lineTo(originX + width / 2 + 5, originY + 35);
  ctx.fill();

  // Eyes.
  ctx.fillStyle = EYE_YELLOW;
  ctx.beginPath();
  ctx.arc(originX + 18, originY + 35, 4, 0, Math.PI * 2);
  ctx.arc(originX + 42, originY + 35, 4, 0, Math.PI * 2);
  ctx.fill();

  // Tunic.
  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX + 15, originY + 65, 30, 30);

  ctx.restore();
}

// ---- Up (back of the character) ----
function drawUpFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 25;
  const originY = 15;
  const width = 60;
  const swing = swingFor(phase, 7);

  ctx.save();

  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX + 12 + swing, originY + 92, 11, 26);
  ctx.fillRect(originX + width - 23 - swing, originY + 92, 11, 26);

  ctx.fillStyle = DARK_GREEN;
  ctx.fillRect(originX - 8, originY + 62 - swing * 0.6, 11, 34);
  ctx.fillRect(originX + width - 3, originY + 62 + swing * 0.6, 11, 34);

  // Ears still poke out either side of the skull from behind.
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.moveTo(originX, originY + 20);
  ctx.lineTo(originX - 20, originY);
  ctx.lineTo(originX, originY + 40);
  ctx.moveTo(originX + width, originY + 20);
  ctx.lineTo(originX + width + 20, originY);
  ctx.lineTo(originX + width, originY + 40);
  ctx.fill();

  // Back of the head — no face, a shade darker to read as "facing away".
  ctx.fillStyle = DARK_GREEN;
  ctx.beginPath();
  ctx.arc(originX + width / 2, originY + 40, 25, 0, Math.PI * 2);
  ctx.fill();

  // Faint centerline down the back of the skull.
  ctx.strokeStyle = '#234a34';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originX + width / 2, originY + 20);
  ctx.lineTo(originX + width / 2, originY + 60);
  ctx.stroke();

  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX + 15, originY + 65, 30, 30);

  ctx.restore();
}

// ---- Side (profile, drawn facing left) ----
function drawSideFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 45;
  const originY = 15;
  const swing = swingFor(phase, 8);

  ctx.save();

  // Trailing (far) leg first, then the near leg on top, swinging opposite
  // directions for the step.
  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX - 6 - swing, originY + 92, 11, 27);
  ctx.fillRect(originX - 6 + swing, originY + 92, 11, 27);

  // One visible arm, swinging fore/aft.
  ctx.fillStyle = GREEN;
  ctx.fillRect(originX - 10 - swing, originY + 63, 11, 32);

  // Ear, folded back near the top-rear of the skull.
  ctx.beginPath();
  ctx.moveTo(originX + 8, originY + 16);
  ctx.lineTo(originX + 26, originY - 2);
  ctx.lineTo(originX + 14, originY + 28);
  ctx.fill();

  // Head.
  ctx.beginPath();
  ctx.arc(originX, originY + 40, 24, 0, Math.PI * 2);
  ctx.fill();

  // The nose protrudes forward (left) — a goblin's defining feature reads
  // even better in profile than head-on.
  ctx.fillStyle = DARK_GREEN;
  ctx.beginPath();
  ctx.moveTo(originX - 24, originY + 43);
  ctx.lineTo(originX - 2, originY + 34);
  ctx.lineTo(originX - 2, originY + 50);
  ctx.fill();

  // Single visible eye.
  ctx.fillStyle = EYE_YELLOW;
  ctx.beginPath();
  ctx.arc(originX - 6, originY + 34, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // Tunic — narrower, biased toward the front of the stance.
  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX - 20, originY + 64, 26, 30);

  ctx.restore();
}

export const GOBLIN_TEXTURES = {
  down: 'goblin-down',
  up: 'goblin-up',
  side: 'goblin-side',
} as const;

export const GOBLIN_ANIMS = {
  down: 'goblin-walk-down',
  up: 'goblin-walk-up',
  side: 'goblin-walk-side',
} as const;

export function createGoblinSprites(scene: Phaser.Scene): void {
  buildWalkSpriteSheet(scene, GOBLIN_TEXTURES.down, drawDownFrame);
  buildWalkSpriteSheet(scene, GOBLIN_TEXTURES.up, drawUpFrame);
  buildWalkSpriteSheet(scene, GOBLIN_TEXTURES.side, drawSideFrame);

  buildWalkAnimation(scene, GOBLIN_ANIMS.down, GOBLIN_TEXTURES.down);
  buildWalkAnimation(scene, GOBLIN_ANIMS.up, GOBLIN_TEXTURES.up);
  buildWalkAnimation(scene, GOBLIN_ANIMS.side, GOBLIN_TEXTURES.side);
}

export { FRAME_WIDTH, FRAME_HEIGHT };
