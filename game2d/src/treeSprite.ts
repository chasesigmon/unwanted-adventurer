// A decorative tree — same "draw it with Canvas 2D, then register it as a
// Phaser texture" approach as grass/stone/concrete (see grassTexture.ts),
// but multi-frame: each frame shifts the canopy a few pixels sideways
// along a sine wave, so looping through all of them reads as the whole
// crown swaying in a breeze. Purely decorative (no collision, no
// per-row depth sorting against characters) — see main.ts's placement
// code for that tradeoff.
const TREE_FRAME_WIDTH = 48;
const TREE_FRAME_HEIGHT = 64;
const TREE_FRAME_COUNT = 8;
const TREE_SWAY_DURATION_MS = 4000;

export const TREE_TEXTURE_KEY = 'tree';
export const TREE_SWAY_ANIM_KEY = 'tree-sway';

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function drawTreeFrame(ctx: CanvasRenderingContext2D, offsetX: number, sway: number): void {
  const cx = offsetX + TREE_FRAME_WIDTH / 2;
  const trunkTop = TREE_FRAME_HEIGHT * 0.55;
  const trunkBottom = TREE_FRAME_HEIGHT - 4;

  // Trunk stays fixed — only the canopy sways.
  ctx.fillStyle = '#5b3a24';
  ctx.fillRect(cx - 4, trunkTop, 8, trunkBottom - trunkTop);
  ctx.fillStyle = '#4a2e1c';
  ctx.fillRect(cx - 4, trunkTop, 3, trunkBottom - trunkTop);

  const canopyCenterY = TREE_FRAME_HEIGHT * 0.38;
  const blobs: Array<[number, number, number, string]> = [
    [-11, 5, 15, '#2f6b2f'],
    [11, 3, 14, '#316f31'],
    [0, -9, 17, '#3d8a3d'],
  ];
  for (const [dx, dy, r, color] of blobs) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + dx + sway, canopyCenterY + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 4; i++) {
    const px = cx + sway + (pseudoRandom(i * 5 + offsetX + 1) - 0.5) * 26;
    const py = canopyCenterY + (pseudoRandom(i * 5 + offsetX + 2) - 0.5) * 22;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createTreeSpritesheet(scene: Phaser.Scene): void {
  const canvas = document.createElement('canvas');
  canvas.width = TREE_FRAME_WIDTH * TREE_FRAME_COUNT;
  canvas.height = TREE_FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  for (let i = 0; i < TREE_FRAME_COUNT; i++) {
    const sway = Math.sin((i / TREE_FRAME_COUNT) * Math.PI * 2) * 3;
    drawTreeFrame(ctx, i * TREE_FRAME_WIDTH, sway);
  }

  scene.textures.addCanvas(TREE_TEXTURE_KEY, canvas);
  const texture = scene.textures.get(TREE_TEXTURE_KEY);
  for (let i = 0; i < TREE_FRAME_COUNT; i++) {
    texture.add(i, 0, i * TREE_FRAME_WIDTH, 0, TREE_FRAME_WIDTH, TREE_FRAME_HEIGHT);
  }
}

export function createTreeSwayAnim(scene: Phaser.Scene): void {
  if (scene.anims.exists(TREE_SWAY_ANIM_KEY)) return;
  scene.anims.create({
    key: TREE_SWAY_ANIM_KEY,
    frames: scene.anims.generateFrameNumbers(TREE_TEXTURE_KEY, { start: 0, end: TREE_FRAME_COUNT - 1 }),
    frameRate: TREE_FRAME_COUNT / (TREE_SWAY_DURATION_MS / 1000),
    repeat: -1,
  });
}
