import Phaser from 'phaser';
import { NetworkManager } from './net.js';
import { createGrassTexture, TILE_SIZE } from './grassTexture.js';
import { createStoneTexture } from './stoneTexture.js';
import { createDoorTexture } from './doorSprite.js';
import {
  preloadCharacterSprites,
  createCharacterAnims,
  textureKeyFor,
  idleFrameFor,
  walkAnimKey,
  punchAnimKey,
  type FacingGroup,
} from './characterSprites.js';
import { getMap } from '../shared/maps.js';
import type { MapName, Race, Direction } from '../shared/constants.js';
import type {
  PlayerSnapshot,
  SyncPayload,
  KickedPayload,
  MapStatePayload,
  PunchPayload,
  CombatEventPayload,
} from '../shared/types.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';
const CHAR_SCALE = 0.55;
// One server round trip per tile-step, throttled the same way holding a
// key down is throttled everywhere else in this project — the walk
// animation plays for exactly this long while tweening between tiles, so
// it reads as a step, not a teleport.
const MOVE_COOLDOWN_MS = 220;

const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 5;
const HP_BAR_OFFSET_Y = -46;
const COMBAT_LOG_MAX_LINES = 60;

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

// ---------- Status bar / combat log (plain DOM, sits on top of the canvas) ----------

const statusLevel = document.getElementById('status-level') as HTMLSpanElement;
const statusHp = document.getElementById('status-hp') as HTMLSpanElement;
const statusMana = document.getElementById('status-mana') as HTMLSpanElement;
const statusMv = document.getElementById('status-mv') as HTMLSpanElement;
const statusExp = document.getElementById('status-exp') as HTMLSpanElement;
const combatLogEl = document.getElementById('combat-log') as HTMLDivElement;

function logCombatMessage(message: string, kind?: 'level-up' | 'death'): void {
  const line = document.createElement('div');
  line.className = kind ? `log-line ${kind}` : 'log-line';
  line.textContent = message;
  combatLogEl.appendChild(line);
  while (combatLogEl.childElementCount > COMBAT_LOG_MAX_LINES) {
    combatLogEl.removeChild(combatLogEl.firstChild as ChildNode);
  }
  combatLogEl.scrollTop = combatLogEl.scrollHeight;
}

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

// Facing IS the sheet's own row now — down/up/left/right are each real,
// fully distinct frames (see characterSprites.ts), not a 3-row sheet with
// a flipped "side" shared between left and right.
type Facing = FacingGroup;

function facingForDirection(direction: Direction): Facing {
  if (direction === 'north') return 'up';
  if (direction === 'south') return 'down';
  return direction === 'west' ? 'left' : 'right';
}

function directionForFacing(facing: Facing): Direction {
  if (facing === 'up') return 'north';
  if (facing === 'down') return 'south';
  return facing === 'left' ? 'west' : 'east';
}

function drawHpBar(bar: Phaser.GameObjects.Graphics, hp: number, maxHp: number): void {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  bar.clear();
  bar.fillStyle(0x000000, 0.55);
  bar.fillRect(-HP_BAR_WIDTH / 2, 0, HP_BAR_WIDTH, HP_BAR_HEIGHT);
  const color = ratio > 0.5 ? 0x3ecf5e : ratio > 0.25 ? 0xd9a53c : 0xd9403c;
  bar.fillStyle(color, 1);
  bar.fillRect(-HP_BAR_WIDTH / 2 + 1, 1, Math.max(0, (HP_BAR_WIDTH - 2) * ratio), HP_BAR_HEIGHT - 2);
}

let gameInstance: Phaser.Game | null = null;

class WorldScene extends Phaser.Scene {
  private network!: NetworkManager;
  private player!: Phaser.GameObjects.Sprite;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprite!: Phaser.GameObjects.Sprite;
  private race: Race = 'goblin';
  private facing: Facing = 'down';
  private currentMap: MapName = 'Great Plains';
  private row = 0;
  private col = 0;
  private myUsername = '';
  private myLevel = 1;
  private myExp = 0;
  private myHp = 100;
  private myMaxHp = 100;
  private myMana = 100;
  private myMaxMana = 100;
  private myMovement = 100;
  private myMaxMovement = 100;
  private isMoving = false;
  private isPunching = false;
  private lastMoveAt = 0;
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Other connected players, static NPCs, and wild monsters sharing the
  // current map — collision itself is enforced server-side; these
  // sprites are just the client's view of who else is standing where
  // (and what right-click can target for a punch). Each carries a small
  // HP bar (a Graphics object stashed via setData) repositioned every
  // frame in update() so it tracks tweened movement smoothly.
  private otherPlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private monsterSprites = new Map<string, Phaser.GameObjects.Sprite>();

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
    preloadCharacterSprites(this);
  }

  create(): void {
    createCharacterAnims(this);

    this.doorSprite = this.add.sprite(0, 0, 'door').setVisible(false);
    this.player = this.add.sprite(0, 0, textureKeyFor('goblin'), idleFrameFor('goblin', 'down')).setScale(CHAR_SCALE);
    this.playerHpBar = this.add.graphics();

    const keyboard = this.input.keyboard!;
    this.moveKeys = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.cursorKeys = keyboard.createCursorKeys();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.handleRightClick(pointer);
    });

    this.network.addEventListener('sync', ((e: CustomEvent<SyncPayload>) => this.applySync(e.detail.player)) as EventListener);
    this.network.addEventListener('map:state', ((e: CustomEvent<MapStatePayload>) => this.applyMapState(e.detail)) as EventListener);
    this.network.addEventListener('punch', ((e: CustomEvent<PunchPayload>) => this.applyRemotePunch(e.detail)) as EventListener);
    this.network.addEventListener('combat', ((e: CustomEvent<CombatEventPayload>) => this.applyCombatEvent(e.detail)) as EventListener);
    this.network.addEventListener('kicked', ((e: CustomEvent<KickedPayload>) => {
      alert(e.detail.message);
      window.location.reload();
    }) as EventListener);
  }

  update(): void {
    this.repositionHpBars();

    if (this.isMoving || this.isPunching) return;
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

  private repositionHpBars(): void {
    this.playerHpBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y);
    for (const sprite of this.otherPlayers.values()) this.repositionBarFor(sprite);
    for (const sprite of this.npcSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.monsterSprites.values()) this.repositionBarFor(sprite);
  }

  private repositionBarFor(sprite: Phaser.GameObjects.Sprite): void {
    const bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    bar?.setPosition(sprite.x, sprite.y + HP_BAR_OFFSET_Y);
  }

  private ensureHpBar(sprite: Phaser.GameObjects.Sprite, hp: number, maxHp: number): void {
    let bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    if (!bar) {
      bar = this.add.graphics();
      sprite.setData('hpBar', bar);
    }
    drawHpBar(bar, hp, maxHp);
  }

  private destroyEntitySprite(sprite: Phaser.GameObjects.Sprite): void {
    (sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined)?.destroy();
    sprite.destroy();
  }

  private tilePosition(row: number, col: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  private setIdle(): void {
    this.player.anims.stop();
    this.player.setTexture(textureKeyFor(this.race), idleFrameFor(this.race, this.facing));
  }

  private updateStatusBar(): void {
    statusLevel.textContent = `Lv ${this.myLevel}`;
    statusHp.textContent = `HP ${this.myHp}/${this.myMaxHp}`;
    statusMana.textContent = `MP ${this.myMana}/${this.myMaxMana}`;
    statusMv.textContent = `MV ${this.myMovement}/${this.myMaxMovement}`;
    statusExp.textContent = `EXP ${this.myExp}`;
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
    this.scale.refresh();

    // Recreated from scratch (rather than reusing setSize() on the
    // existing tile sprite) — on the very first map load, resizing an
    // existing TileSprite from its initial placeholder size didn't
    // reliably take effect (the floor stayed tiny, top-left corner only,
    // until a later map transition happened to fix it). Building a fresh
    // one at the correct size from the start sidesteps that entirely.
    this.floorTile?.destroy();
    this.floorTile = this.add
      .tileSprite(0, 0, pixelWidth, pixelHeight, mapName === 'Labyrinth' ? 'stone' : 'grass')
      .setOrigin(0, 0)
      .setDepth(-1);

    const door = def.exits[0];
    if (door) {
      const pos = this.tilePosition(door.row, door.col);
      this.doorSprite.setPosition(pos.x, pos.y).setVisible(true);
    } else {
      this.doorSprite.setVisible(false);
    }

    // Other entities belong to whichever map we just left — clear them
    // out immediately rather than waiting for the next map:state.
    for (const sprite of this.otherPlayers.values()) this.destroyEntitySprite(sprite);
    this.otherPlayers.clear();
    for (const sprite of this.npcSprites.values()) this.destroyEntitySprite(sprite);
    this.npcSprites.clear();
    for (const sprite of this.monsterSprites.values()) this.destroyEntitySprite(sprite);
    this.monsterSprites.clear();
  }

  private applySync(player: PlayerSnapshot): void {
    this.myUsername = player.username;
    this.race = player.race;
    this.row = player.row;
    this.col = player.col;
    this.myLevel = player.level;
    this.myExp = player.exp;
    this.myHp = player.hp;
    this.myMaxHp = player.maxHp;
    this.myMana = player.mana;
    this.myMaxMana = player.maxMana;
    this.myMovement = player.movement;
    this.myMaxMovement = player.maxMovement;
    this.updateStatusBar();

    this.renderMap(player.map);
    const pos = this.tilePosition(player.row, player.col);
    this.player.setPosition(pos.x, pos.y);
    this.setIdle();
    this.ensureHpBar(this.player, this.myHp, this.myMaxHp);
  }

  private applyMapState(state: MapStatePayload): void {
    // We don't know our own (server-canonical, exact-case) username until
    // the 'sync' event sets it — without this guard, a map:state that
    // somehow arrived first would fail to filter "us" out of the roster
    // and spawn a permanent, never-updated ghost duplicate of our own
    // sprite (always facing its default down/idle pose, since only real
    // *other* players get their facing driven by remote punches).
    if (!this.myUsername) return;

    const seenPlayers = new Set<string>();
    for (const p of state.players) {
      if (p.username === this.myUsername) continue;
      seenPlayers.add(p.username);

      let sprite = this.otherPlayers.get(p.username);
      if (!sprite) {
        const pos = this.tilePosition(p.row, p.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(p.race), idleFrameFor(p.race, 'down')).setScale(CHAR_SCALE);
        this.otherPlayers.set(p.username, sprite);
      }
      sprite.setData('race', p.race);
      sprite.setData('row', p.row);
      sprite.setData('col', p.col);
      if (!sprite.getData('isPunching')) {
        const pos = this.tilePosition(p.row, p.col);
        sprite.setPosition(pos.x, pos.y);
      }
      this.ensureHpBar(sprite, p.hp, p.maxHp);
    }
    for (const [username, sprite] of this.otherPlayers) {
      if (!seenPlayers.has(username)) {
        this.destroyEntitySprite(sprite);
        this.otherPlayers.delete(username);
      }
    }

    for (const npc of state.npcs) {
      let sprite = this.npcSprites.get(npc.id);
      const pos = this.tilePosition(npc.row, npc.col);
      if (!sprite) {
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(npc.race), idleFrameFor(npc.race, 'down')).setScale(CHAR_SCALE);
        this.npcSprites.set(npc.id, sprite);
      }
      sprite.setData('race', npc.race);
      sprite.setData('row', npc.row);
      sprite.setData('col', npc.col);
      this.ensureHpBar(sprite, npc.hp, npc.maxHp);
    }

    const seenMonsters = new Set<string>();
    for (const m of state.monsters) {
      seenMonsters.add(m.id);

      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) {
        const pos = this.tilePosition(m.row, m.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(m.kind), idleFrameFor(m.kind, 'down')).setScale(CHAR_SCALE);
        this.monsterSprites.set(m.id, sprite);
      }
      sprite.setData('kind', m.kind);
      sprite.setData('row', m.row);
      sprite.setData('col', m.col);
      if (!sprite.getData('isPunching')) {
        const pos = this.tilePosition(m.row, m.col);
        sprite.setPosition(pos.x, pos.y);
      }
      this.ensureHpBar(sprite, m.hp, m.maxHp);
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(id);
      }
    }
  }

  private attemptMove(direction: Direction): void {
    this.facing = facingForDirection(direction);
    this.player.play(walkAnimKey(this.race, this.facing), true);
    this.isMoving = true;

    this.network
      .move(direction)
      .then((ack) => {
        if (!ack.ok) {
          this.isMoving = false;
          this.setIdle();
          return;
        }

        this.row = ack.player.row;
        this.col = ack.player.col;

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

  // Right-click on another player, the training dummy, or a wild monster:
  // throw a punch in whichever direction the player is CURRENTLY facing
  // (from the last WASD/arrow press) — the click just has to land on a
  // target, it doesn't re-aim the punch toward it. Damage only actually
  // applies server-side if that target is standing exactly one tile
  // ahead in the punched direction (see game.gateway.ts's handlePunch) —
  // right-clicking a target further away still throws the punch (and
  // still looks the same locally) but simply won't connect.
  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isMoving || this.isPunching) return;
    if (!this.findEntityAt(pointer.worldX, pointer.worldY)) return;

    this.performPunch(directionForFacing(this.facing));
  }

  private findEntityAt(x: number, y: number): boolean {
    for (const sprite of [...this.otherPlayers.values(), ...this.npcSprites.values(), ...this.monsterSprites.values()]) {
      if (sprite.getBounds().contains(x, y)) return true;
    }
    return false;
  }

  private performPunch(direction: Direction): void {
    this.facing = facingForDirection(direction);
    const animKey = punchAnimKey(this.race, this.facing);

    this.isPunching = true;
    this.player.play(animKey, true);
    this.player.once(`animationcomplete-${animKey}`, () => {
      this.isPunching = false;
      this.setIdle();
    });

    this.network.punch(direction);
  }

  private applyRemotePunch({ username, direction }: PunchPayload): void {
    const sprite = this.otherPlayers.get(username);
    if (!sprite) return;

    const race = sprite.getData('race') as Race;
    const facing = facingForDirection(direction);
    const animKey = punchAnimKey(race, facing);

    sprite.setData('isPunching', true);
    sprite.play(animKey, true);
    sprite.once(`animationcomplete-${animKey}`, () => {
      sprite.setData('isPunching', false);
      sprite.setTexture(textureKeyFor(race), idleFrameFor(race, 'down'));
    });
  }

  // The server resolves damage/exp/leveling and broadcasts the outcome —
  // this just reflects it: a combat-log line, and an immediate HP-bar/
  // status-bar update rather than waiting for the next map:state tick.
  private applyCombatEvent(event: CombatEventPayload): void {
    const logKind = event.targetDied ? 'death' : event.leveledUp ? 'level-up' : undefined;
    logCombatMessage(event.message, logKind);
    if (event.leveledUp && event.attacker === this.myUsername) {
      logCombatMessage(`${this.myUsername} reaches level ${event.attackerLevel}!`, 'level-up');
    }

    if (event.attacker === this.myUsername) {
      this.applyOwnStats({ level: event.attackerLevel, exp: event.attackerExp, hp: event.attackerHp, maxHp: event.attackerMaxHp });
    }

    if (event.targetKind === 'player' && event.target === this.myUsername) {
      this.applyOwnStats({ hp: event.targetHp, maxHp: event.targetMaxHp });
      return; // if we died, a fresh 'sync' follows separately with our respawned position
    }

    if (event.targetKind === 'npc') {
      const sprite = this.npcSprites.get(event.target);
      if (sprite) this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
    } else if (event.targetKind === 'monster') {
      const sprite = this.monsterSprites.get(event.target);
      if (!sprite) return;
      if (event.targetDied) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(event.target);
      } else {
        this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
      }
    } else if (event.targetKind === 'player') {
      const sprite = this.otherPlayers.get(event.target);
      if (sprite) this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
    }
  }

  private applyOwnStats(updates: Partial<{ level: number; exp: number; hp: number; maxHp: number }>): void {
    if (updates.level !== undefined) this.myLevel = updates.level;
    if (updates.exp !== undefined) this.myExp = updates.exp;
    if (updates.hp !== undefined) this.myHp = updates.hp;
    if (updates.maxHp !== undefined) this.myMaxHp = updates.maxHp;
    this.ensureHpBar(this.player, this.myHp, this.myMaxHp);
    this.updateStatusBar();
  }
}

function startGame(): void {
  // Guards against a double game.new instance (e.g. a double form submit)
  // creating two overlapping Phaser canvases on top of each other.
  if (gameInstance) return;

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
  gameInstance = game;

  game.scene.add('world', WorldScene, true, { network });

  network.connectSocket();
}
