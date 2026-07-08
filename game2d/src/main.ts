import Phaser from 'phaser';
import { createGrassTexture, TILE_SIZE } from './grassTexture.js';
import { createGoblinSpriteSheet, buildGoblinWalkAnimation, FRAME_WIDTH, FRAME_HEIGHT } from './goblinSprite.js';

// A basic, standalone roam-around demo: no login, no server — the goblin
// is handed to you the moment the page loads. The whole map fits on
// screen at once (20x20 tiles), so there's no camera-follow to reason
// about, just free WASD/arrow movement clamped to the world's edges.
const WORLD_TILES = 20;
const WORLD_SIZE = WORLD_TILES * TILE_SIZE;
const PLAYER_SPEED = 140; // pixels/second
const PLAYER_SCALE = 0.55;

class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('world');
  }

  preload(): void {
    createGrassTexture(this, 'grass');
    createGoblinSpriteSheet(this, 'goblin-walk');
  }

  create(): void {
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'grass').setOrigin(0, 0);

    buildGoblinWalkAnimation(this, 'goblin-walk');

    this.player = this.add.sprite(WORLD_SIZE / 2, WORLD_SIZE / 2, 'goblin-walk', 0).setScale(PLAYER_SCALE);

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
      const length = Math.hypot(dx, dy);
      const distance = (PLAYER_SPEED * delta) / 1000;
      const stepX = (dx / length) * distance;
      const stepY = (dy / length) * distance;

      const halfWidth = (FRAME_WIDTH * PLAYER_SCALE) / 2;
      const halfHeight = (FRAME_HEIGHT * PLAYER_SCALE) / 2;
      const nextX = Phaser.Math.Clamp(this.player.x + stepX, halfWidth, WORLD_SIZE - halfWidth);
      const nextY = Phaser.Math.Clamp(this.player.y + stepY, halfHeight, WORLD_SIZE - halfHeight);
      this.player.setPosition(nextX, nextY);

      if (!this.player.anims.isPlaying) {
        this.player.play('goblin-walk');
      }
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop();
      this.player.setTexture('goblin-walk', 0);
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
