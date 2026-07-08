import Phaser from 'phaser';
import { createGrassTexture, TILE_SIZE } from './grassTexture.js';
import { createGoblinSprites, GOBLIN_TEXTURES, GOBLIN_ANIMS, FRAME_WIDTH, FRAME_HEIGHT } from './goblinSprite.js';
import { createSkeletonSprites, SKELETON_TEXTURES } from './skeletonSprite.js';

// A basic, standalone roam-around demo: no login, no server — the goblin
// is handed to you the moment the page loads. The whole map fits on
// screen at once (20x20 tiles), so there's no camera-follow to reason
// about, just free WASD/arrow movement clamped to the world's edges.
const WORLD_TILES = 20;
const WORLD_SIZE = WORLD_TILES * TILE_SIZE;
const PLAYER_SPEED = 140; // pixels/second
const CHAR_SCALE = 0.55;

type Facing = 'down' | 'up' | 'left' | 'right';

// Down/up each have their own sheet; left and right share the "side"
// sheet — the sprite is flipped horizontally for right-facing rather
// than hand-drawing a mirrored duplicate (see goblinSprite.ts).
function textureAndFlipFor(facing: Facing): { texture: (typeof GOBLIN_TEXTURES)[keyof typeof GOBLIN_TEXTURES]; anim: (typeof GOBLIN_ANIMS)[keyof typeof GOBLIN_ANIMS]; flip: boolean } {
  switch (facing) {
    case 'down':
      return { texture: GOBLIN_TEXTURES.down, anim: GOBLIN_ANIMS.down, flip: false };
    case 'up':
      return { texture: GOBLIN_TEXTURES.up, anim: GOBLIN_ANIMS.up, flip: false };
    case 'left':
      return { texture: GOBLIN_TEXTURES.side, anim: GOBLIN_ANIMS.side, flip: false };
    case 'right':
      return { texture: GOBLIN_TEXTURES.side, anim: GOBLIN_ANIMS.side, flip: true };
  }
}

class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private facing: Facing = 'down';
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('world');
  }

  preload(): void {
    createGrassTexture(this, 'grass');
    createGoblinSprites(this);
    createSkeletonSprites(this);
  }

  create(): void {
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'grass').setOrigin(0, 0);

    // A stationary skeleton, planted at the exact center of the map — it
    // has the same full set of directional walk animations built (see
    // skeletonSprite.ts) for whenever it needs to actually move, but for
    // now it just stands facing the player's spawn point.
    this.add.sprite(WORLD_SIZE / 2, WORLD_SIZE / 2, SKELETON_TEXTURES.down, 0).setScale(CHAR_SCALE);

    // The player spawns a few tiles south of center, in view of the
    // skeleton, rather than exactly on top of it.
    this.player = this.add
      .sprite(WORLD_SIZE / 2, WORLD_SIZE / 2 + TILE_SIZE * 4, GOBLIN_TEXTURES.down, 0)
      .setScale(CHAR_SCALE);

    const keyboard = this.input.keyboard!;
    this.moveKeys = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.cursorKeys = keyboard.createCursorKeys();
  }

  update(_time: number, delta: number): void {
    let dx = 0;
    let dy = 0;
    if (this.moveKeys.a.isDown || this.cursorKeys.left.isDown) dx -= 1;
    if (this.moveKeys.d.isDown || this.cursorKeys.right.isDown) dx += 1;
    if (this.moveKeys.w.isDown || this.cursorKeys.up.isDown) dy -= 1;
    if (this.moveKeys.s.isDown || this.cursorKeys.down.isDown) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      // Horizontal takes priority over vertical when both are held (e.g.
      // holding W+D shows the right-facing walk, not the back view) —
      // there's only one sprite per axis, so a diagonal step has to pick.
      if (dx < 0) this.facing = 'left';
      else if (dx > 0) this.facing = 'right';
      else if (dy < 0) this.facing = 'up';
      else if (dy > 0) this.facing = 'down';

      const length = Math.hypot(dx, dy);
      const distance = (PLAYER_SPEED * delta) / 1000;
      const stepX = (dx / length) * distance;
      const stepY = (dy / length) * distance;

      const halfWidth = (FRAME_WIDTH * CHAR_SCALE) / 2;
      const halfHeight = (FRAME_HEIGHT * CHAR_SCALE) / 2;
      const nextX = Phaser.Math.Clamp(this.player.x + stepX, halfWidth, WORLD_SIZE - halfWidth);
      const nextY = Phaser.Math.Clamp(this.player.y + stepY, halfHeight, WORLD_SIZE - halfHeight);
      this.player.setPosition(nextX, nextY);

      const { anim, flip } = textureAndFlipFor(this.facing);
      this.player.setFlipX(flip);
      // `true` (ignoreIfPlaying) stops this from restarting the cycle
      // back to frame 0 on every single frame it's held.
      this.player.play(anim, true);
    } else if (this.player.anims.isPlaying) {
      const { texture, flip } = textureAndFlipFor(this.facing);
      this.player.anims.stop();
      this.player.setFlipX(flip);
      this.player.setTexture(texture, 0);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: WORLD_SIZE,
  height: WORLD_SIZE,
  pixelArt: true,
  backgroundColor: '#14181a',
  scene: [WorldScene],
});
