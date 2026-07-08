// A stone doorway, drawn with Canvas 2D vector calls — a light stone
// frame around a dark opening, a keystone accent up top, a few block
// lines down the sides for texture. Placed once at whichever tile a map
// defines as its door (see shared/maps.ts), not tiled/repeated.
const DOOR_WIDTH = 40;
const DOOR_HEIGHT = 48;

export function createDoorTexture(scene: Phaser.Scene, key: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = DOOR_WIDTH;
  canvas.height = DOOR_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Stone frame.
  ctx.fillStyle = '#8a8d91';
  ctx.fillRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT);

  // Dark doorway opening.
  ctx.fillStyle = '#1c1d1f';
  ctx.fillRect(6, 8, DOOR_WIDTH - 12, DOOR_HEIGHT - 12);

  // A hint of depth just inside the opening.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(6, 8, DOOR_WIDTH - 12, 4);

  // Frame outline.
  ctx.strokeStyle = '#5c5f63';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, DOOR_WIDTH - 4, DOOR_HEIGHT - 4);

  // Keystone.
  ctx.fillStyle = '#a3a6aa';
  ctx.beginPath();
  ctx.moveTo(DOOR_WIDTH / 2 - 6, 0);
  ctx.lineTo(DOOR_WIDTH / 2 + 6, 0);
  ctx.lineTo(DOOR_WIDTH / 2 + 3, 9);
  ctx.lineTo(DOOR_WIDTH / 2 - 3, 9);
  ctx.fill();

  // Block-line texture down each side post.
  ctx.strokeStyle = '#6f7377';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (DOOR_HEIGHT / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(6, y);
    ctx.moveTo(DOOR_WIDTH - 6, y);
    ctx.lineTo(DOOR_WIDTH, y);
    ctx.stroke();
  }

  scene.textures.addCanvas(key, canvas);
}

export { DOOR_WIDTH, DOOR_HEIGHT };
