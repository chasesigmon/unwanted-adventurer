// The goblin, drawn with the same plain Canvas 2D vector approach as the
// original preview (ears, round head, triangular nose, dot eyes, tunic) —
// extended with arms and legs so a walk cycle actually has something to
// animate. Four frames are drawn onto one offscreen canvas (neutral,
// left-leg-forward, neutral, right-leg-forward) and registered with
// Phaser as a real sprite sheet (see buildGoblinWalkAnimation).
const FRAME_WIDTH = 110;
const FRAME_HEIGHT = 140;
const FRAME_COUNT = 4;

const GREEN = '#3b7a57';
const DARK_GREEN = '#2e5e43';
const TUNIC = '#1e3f28';
const EYE_YELLOW = '#ffcc00';

// originX/originY is the top-left of the *original* 60x80 bounding box
// used by the preview code (ears/head start there) — every frame is
// drawn at the same local origin within its own cell, offset only by how
// far the swinging limbs shift for that phase of the cycle.
function drawGoblinFrame(ctx: CanvasRenderingContext2D, cellX: number, phase: number): void {
  const originX = cellX + 25;
  const originY = 15;
  const width = 60;
  const height = 80;

  // phase 0/2 = neutral stance, 1 = left leg + right arm forward, 3 = the
  // opposite — a simple 4-step "neutral, swing, neutral, swing" cycle.
  const swing = phase === 1 ? 7 : phase === 3 ? -7 : 0;

  ctx.save();

  // Legs — drawn first so the tunic overlaps their tops.
  ctx.fillStyle = TUNIC;
  const legWidth = 11;
  const legHeight = 26;
  const legY = originY + 92;
  ctx.fillRect(originX + 12 + swing, legY, legWidth, legHeight);
  ctx.fillRect(originX + width - 12 - legWidth - swing, legY, legWidth, legHeight);

  // Arms — swing opposite their same-side leg, classic contralateral gait.
  ctx.fillStyle = GREEN;
  const armWidth = 11;
  const armHeight = 34;
  const armY = originY + 62;
  ctx.fillRect(originX - armWidth + 3, armY - swing * 0.6, armWidth, armHeight);
  ctx.fillRect(originX + width - 3, armY + swing * 0.6, armWidth, armHeight);

  // Pointy ears.
  ctx.fillStyle = GREEN;
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

  // Tunic (torso) — last, same as the original preview's draw order.
  ctx.fillStyle = TUNIC;
  ctx.fillRect(originX + 15, originY + 65, 30, 30);

  ctx.restore();
}

// Builds the walk-cycle sheet and registers it with Phaser's texture
// manager under `key`, ready for `anims.generateFrameNumbers(key, ...)`.
export function createGoblinSpriteSheet(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH * FRAME_COUNT;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    drawGoblinFrame(ctx, frame * FRAME_WIDTH, frame);
  }

  // addSpriteSheet needs an existing Phaser Texture as its source (not a
  // bare canvas) to slice into indexed frames — addCanvas registers the
  // raw image first, then addSpriteSheet re-slices that same texture in
  // place (see Phaser's TextureManager — passing a Texture as `source`
  // makes it reuse `source.key` and ignore the `key` argument entirely,
  // hence the empty string here).
  const raw = scene.textures.addCanvas(key, canvas);
  if (raw) {
    scene.textures.addSpriteSheet('', raw, { frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT });
  }
}

export function buildGoblinWalkAnimation(scene: Phaser.Scene, key: string): void {
  scene.anims.create({
    key: 'goblin-walk',
    frames: scene.anims.generateFrameNumbers(key, { start: 0, end: FRAME_COUNT - 1 }),
    frameRate: 8,
    repeat: -1,
  });
}

export { FRAME_WIDTH, FRAME_HEIGHT };
