import Phaser from 'phaser';
import { NetworkManager } from './net.js';
import { createGrassTexture, TILE_SIZE } from './grassTexture.js';
import { createStoneTexture } from './stoneTexture.js';
import { createDoorTexture } from './doorSprite.js';
import { createGoblinSprites, GOBLIN_TEXTURES, GOBLIN_ANIMS } from './goblinSprite.js';
import { createSkeletonSprites, SKELETON_TEXTURES, SKELETON_ANIMS } from './skeletonSprite.js';
import { getMap } from '../shared/maps.js';
import type { MapName, Race, Direction } from '../shared/constants.js';
import type { PlayerSnapshot, SyncPayload, KickedPayload } from '../shared/types.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';
const CHAR_SCALE = 0.55;
// One server round trip per tile-step, throttled the same way holding a
// key down is throttled everywhere else in this project — the walk
// animation plays for exactly this long while tweening between tiles, so
// it reads as a step, not a teleport.
const MOVE_COOLDOWN_MS = 220;

// ---------- Auth screen ----------

const authScreen = document.getElementById('auth-screen') as HTMLDivElement;
const gameRoot = document.getElementById('game-root') as HTMLDivElement;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
const raceLabel = document.getElementById('auth-race-label') as HTMLLabelElement;
const raceSelect = document.getElementById('auth-race') as HTMLSelectElement;
const authError = document.getElementById('auth-error') as HTMLDivElement;
const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
const tabRegister = document.getElementById('tab-register') as HTMLButtonElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;

const network = new NetworkManager(SERVER_URL);

let mode: 'login' | 'register' = 'login';
function setMode(next: 'login' | 'register'): void {
  mode = next;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  raceLabel.hidden = mode !== 'register';
  submitBtn.textContent = mode === 'register' ? 'Register' : 'Login';
}
tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));
setMode('login');

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void handleAuthSubmit();
});

async function handleAuthSubmit(): Promise<void> {
  authError.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const race = raceSelect.value;

  try {
    if (mode === 'register') {
      await network.register(username, password, race);
    } else {
      await network.login(username, password);
    }
  } catch (err) {
    authError.textContent = err instanceof Error ? err.message : 'Request failed.';
    return;
  }

  startGame();
}

// ---------- Game ----------

type Facing = 'down' | 'up' | 'left' | 'right';

interface DirectionalSprites {
  textures: Record<'down' | 'up' | 'side', string>;
  anims: Record<'down' | 'up' | 'side', string>;
}

function spritesFor(race: Race): DirectionalSprites {
  return race === 'goblin' ? { textures: GOBLIN_TEXTURES, anims: GOBLIN_ANIMS } : { textures: SKELETON_TEXTURES, anims: SKELETON_ANIMS };
}

class WorldScene extends Phaser.Scene {
  private network!: NetworkManager;
  private player!: Phaser.GameObjects.Sprite;
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprite!: Phaser.GameObjects.Sprite;
  private race: Race = 'goblin';
  private facing: Facing = 'down';
  private currentMap: MapName = 'Great Plains';
  private isMoving = false;
  private lastMoveAt = 0;
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('world');
  }

  init(data: { network: NetworkManager }): void {
    this.network = data.network;
  }

  preload(): void {
    createGrassTexture(this, 'grass');
    createStoneTexture(this, 'stone');
    createDoorTexture(this, 'door');
    createGoblinSprites(this);
    createSkeletonSprites(this);
  }

  create(): void {
    this.floorTile = this.add.tileSprite(0, 0, TILE_SIZE, TILE_SIZE, 'grass').setOrigin(0, 0);
    this.doorSprite = this.add.sprite(0, 0, 'door').setVisible(false);
    this.player = this.add.sprite(0, 0, GOBLIN_TEXTURES.down, 0).setScale(CHAR_SCALE);

    const keyboard = this.input.keyboard!;
    this.moveKeys = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.cursorKeys = keyboard.createCursorKeys();

    this.network.addEventListener('sync', ((e: CustomEvent<SyncPayload>) => this.applySync(e.detail.player)) as EventListener);
    this.network.addEventListener('kicked', ((e: CustomEvent<KickedPayload>) => {
      alert(e.detail.message);
      window.location.reload();
    }) as EventListener);
  }

  update(): void {
    if (this.isMoving) return;
    const now = Date.now();
    if (now - this.lastMoveAt < MOVE_COOLDOWN_MS) return;

    let direction: Direction | undefined;
    if (this.moveKeys.a.isDown || this.cursorKeys.left.isDown) direction = 'west';
    else if (this.moveKeys.d.isDown || this.cursorKeys.right.isDown) direction = 'east';
    else if (this.moveKeys.w.isDown || this.cursorKeys.up.isDown) direction = 'north';
    else if (this.moveKeys.s.isDown || this.cursorKeys.down.isDown) direction = 'south';

    if (!direction) return;
    this.lastMoveAt = now;
    this.attemptMove(direction);
  }

  private tilePosition(row: number, col: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  private idleTextureKey(): string {
    const { textures } = spritesFor(this.race);
    if (this.facing === 'up') return textures.up;
    if (this.facing === 'left' || this.facing === 'right') return textures.side;
    return textures.down;
  }

  private setIdle(): void {
    this.player.anims.stop();
    this.player.setFlipX(this.facing === 'right');
    this.player.setTexture(this.idleTextureKey(), 0);
  }

  // Resizes the game to the new map's pixel footprint and swaps its floor
  // texture/door position — both current maps happen to be 20x20, so in
  // practice this never actually changes the canvas size, but a map of a
  // different size would just work.
  private renderMap(mapName: MapName): void {
    this.currentMap = mapName;
    const def = getMap(mapName);
    const pixelWidth = def.cols * TILE_SIZE;
    const pixelHeight = def.rows * TILE_SIZE;

    this.scale.resize(pixelWidth, pixelHeight);
    this.floorTile.setTexture(mapName === 'Labyrinth' ? 'stone' : 'grass').setSize(pixelWidth, pixelHeight);

    const door = def.exits[0];
    if (door) {
      const pos = this.tilePosition(door.row, door.col);
      this.doorSprite.setPosition(pos.x, pos.y).setVisible(true);
    } else {
      this.doorSprite.setVisible(false);
    }
  }

  private applySync(player: PlayerSnapshot): void {
    this.race = player.race;
    this.renderMap(player.map);
    const pos = this.tilePosition(player.row, player.col);
    this.player.setPosition(pos.x, pos.y);
    this.setIdle();
  }

  private attemptMove(direction: Direction): void {
    this.facing = direction === 'west' ? 'left' : direction === 'east' ? 'right' : direction === 'north' ? 'up' : 'down';

    const { anims } = spritesFor(this.race);
    const animKey = this.facing === 'up' ? anims.up : this.facing === 'left' || this.facing === 'right' ? anims.side : anims.down;
    this.player.setFlipX(this.facing === 'right');
    this.player.play(animKey, true);
    this.isMoving = true;

    this.network
      .move(direction)
      .then((ack) => {
        if (!ack.ok) {
          this.isMoving = false;
          this.setIdle();
          return;
        }

        if (ack.player.map !== this.currentMap) {
          // A map transition is a load, not a walk — snap straight to the
          // new map rather than tweening across two different worlds.
          this.race = ack.player.race;
          this.renderMap(ack.player.map);
          const pos = this.tilePosition(ack.player.row, ack.player.col);
          this.player.setPosition(pos.x, pos.y);
          this.isMoving = false;
          this.setIdle();
          return;
        }

        const pos = this.tilePosition(ack.player.row, ack.player.col);
        this.tweens.add({
          targets: this.player,
          x: pos.x,
          y: pos.y,
          duration: MOVE_COOLDOWN_MS,
          onComplete: () => {
            this.isMoving = false;
            this.setIdle();
          },
        });
      })
      .catch(() => {
        this.isMoving = false;
        this.setIdle();
      });
  }
}

function startGame(): void {
  authScreen.hidden = true;
  gameRoot.hidden = false;

  const startingMap = getMap('Great Plains');
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: startingMap.cols * TILE_SIZE,
    height: startingMap.rows * TILE_SIZE,
    pixelArt: true,
    backgroundColor: '#14181a',
  });

  game.scene.add('world', WorldScene, true, { network });

  network.connectSocket();
}
