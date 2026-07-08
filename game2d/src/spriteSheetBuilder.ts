// Shared by every character (goblin, skeleton, ...): lays out however many
// walk-cycle frames a draw callback produces onto one offscreen canvas,
// registers it with Phaser as a real sprite sheet, and wires up the
// looping animation. Kept generic so each character file only has to
// describe *how to draw one frame*, not how sprite sheets work.
export const FRAME_WIDTH = 110;
export const FRAME_HEIGHT = 140;
export const FRAME_COUNT = 4;

export type FrameDrawer = (ctx: CanvasRenderingContext2D, cellX: number, phase: number) => void;

export function buildWalkSpriteSheet(scene: Phaser.Scene, key: string, drawFrame: FrameDrawer): void {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH * FRAME_COUNT;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    drawFrame(ctx, frame * FRAME_WIDTH, frame);
  }

  // addSpriteSheet needs an existing Phaser Texture as its source (not a
  // bare canvas) to slice into indexed frames — addCanvas registers the
  // raw image first, then addSpriteSheet re-slices that same texture in
  // place (passing a Texture as `source` makes Phaser reuse `source.key`
  // and ignore the `key` argument entirely, hence the empty string here).
  const raw = scene.textures.addCanvas(key, canvas);
  if (raw) {
    scene.textures.addSpriteSheet('', raw, { frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT });
  }
}

export function buildWalkAnimation(scene: Phaser.Scene, animKey: string, textureKey: string, frameRate = 8): void {
  scene.anims.create({
    key: animKey,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: FRAME_COUNT - 1 }),
    frameRate,
    repeat: -1,
  });
}

// The swing offset shared by every walk cycle: neutral, forward, neutral,
// back — frame 1 and frame 3 are mirror opposites of each other.
export function swingFor(phase: number, amount: number): number {
  if (phase === 1) return amount;
  if (phase === 3) return -amount;
  return 0;
}
