import Phaser from 'phaser';
import type { NetworkManager } from '../net.js';
import { createWallTorchTexture, WALL_TORCH_TEXTURE_KEY } from '../wallTorchSprite.js';
import {
  preloadCharacterSprites,
  createCharacterAnims,
  defineBodyPartFrames,
  bodyPartFrameKey,
  textureKeyFor,
  idleFrameFor,
  walkAnimKey,
  punchAnimKey,
  effectiveSpriteKind,
  type SpriteKind,
} from '../characterSprites.js';
import { getMap, MAPS, TOWN_MID_COL } from '../../shared/maps.js';
import { treePositionsFor } from '../../shared/trees.js';
import {
  PUNCH_SKILL,
  DAGGER_SKILL,
  MIMIC_SKILL,
  REVERT_SKILL,
  INFRAVISION_SKILL,
} from '../../shared/skills.js';
import {
  isDarkHour,
  LIGHT_RADIUS_TILES,
  SHOP_REACH_TILES,
  isNearStaticLight,
  isWithinLightRadius,
  isWithinRadius,
  TORCH_ITEM,
  isAlwaysLit,
  torchWallPositionsFor,
  fireplacePositionsFor,
} from '../../shared/lighting.js';
import { MONSTER_KINDS, FLORO_SHOP_MAPS, GRIMOAK_CASTLE_MAPS } from '../../shared/constants.js';
import type { MapName, Race, Direction, MonsterKind, Gender, HairColor, SkinTone } from '../../shared/constants.js';
import type {
  PlayerSnapshot,
  SyncPayload,
  KickedPayload,
  MapStatePayload,
  PunchPayload,
  CombatEventPayload,
  ChatPayload,
  StatTickPayload,
  RestState,
  WorldTimePayload,
} from '../../shared/types.js';
import {
  BAR_STACK_GAP,
  BONE_SHIELD_TEXTURE_KEY,
  CASTLE_EXTERIOR_HEIGHT,
  CASTLE_EXTERIOR_SCALE,
  CASTLE_EXTERIOR_TEXTURE_KEY,
  CASTLE_EXTERIOR_WIDTH,
  CHAR_SCALE,
  CORPSE_SCALE,
  CROW_TEXTURE_KEY,
  DAGGER_TEXTURE_KEY,
  type Facing,
  FIREPLACE_TEXTURE_KEY,
  HP_BAR_HEIGHT,
  HP_BAR_OFFSET_Y,
  MANA_BAR_COLOR,
  MOVE_COOLDOWN_MS,
  REMOTE_STEP_TWEEN_MS,
  SHOP_BUILDING_FACING_LEFT_FRAME,
  SHOP_BUILDING_FACING_RIGHT_FRAME,
  SHOP_BUILDING_FRAME_HEIGHT,
  SHOP_BUILDING_FRAME_WIDTH,
  SHOP_BUILDING_TEXTURE_KEY,
  SWORD_CURSOR,
  TILE_SIZE,
  TORCH_HELD_TEXTURE_KEY,
  TREE_TEXTURE_KEY,
  STAIRS_TEXTURE_KEY,
  WOODEN_DOOR_CLOSED_FRAME,
  WOODEN_DOOR_FRAME_HEIGHT,
  WOODEN_DOOR_FRAME_WIDTH,
  WOODEN_DOOR_TEXTURE_KEY,
  drawHpBar,
  drawStatBar,
  facingForDirection,
  floorTextureFor,
} from './mapRender.js';
import { myProfile, setActiveScene, setMyProfile, currentWorldHour, worldTimeKnown, setWorldTime } from '../state.js';
import {
  applyDaynightTint,
  hideDarkFog,
  NO_LIGHT_RADIUS_TILES,
  showDarkFog,
  updateDaynightOverlay,
  updateSleepOverlay,
  updateStatusBar,
  updateWorldLabel,
} from '../ui/statusBar.js';
import { logChatMessage, logCombatMessage, noteCombatActivity, openChatInputWithText } from '../ui/log.js';
import { showCenterToast } from '../ui/toast.js';
import { loadActionBarOnce } from '../ui/actionBar.js';
import { isInputCaptured, isMovementBlocked, refreshOpenModals } from '../ui/modalCore.js';
import { openCorpseModal, updateEatBrainsButton } from '../ui/corpseModal.js';
import { openShopModal } from '../ui/shopModal.js';
import { openTargetInfoModal } from '../ui/targetInfoModal.js';
import { notifyMapChanged } from '../ui/mapModal.js';
import { hideTargetPanel, updateTargetPanel } from '../ui/targetPanel.js';

const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;

export class WorldScene extends Phaser.Scene {
  private network!: NetworkManager;
  private player!: Phaser.GameObjects.Sprite;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerManaBar!: Phaser.GameObjects.Graphics;
  private playerWeaponSprite!: Phaser.GameObjects.Sprite;
  private playerShieldSprite!: Phaser.GameObjects.Sprite;
  private playerTorchSprite!: Phaser.GameObjects.Sprite;
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprites: Phaser.GameObjects.Sprite[] = [];
  // The decorative shop building standing behind each of Floro's shop
  // doors (item 13) — only populated while rendering the 'Floro' map
  // itself (the shop interiors don't need their own exterior rendered).
  private shopBuildingSprites: Phaser.GameObjects.Sprite[] = [];
  // Grimoak Castle's exterior + its flying crows (item 4) — only
  // populated on 'Grimoak Grounds'; the fireplaces (item 6) below are
  // only populated inside the castle's own interior rooms.
  private castleExteriorSprites: Phaser.GameObjects.Sprite[] = [];
  private crowSprites: Phaser.GameObjects.Sprite[] = [];
  private fireplaceSprites: Phaser.GameObjects.Sprite[] = [];
  private race: Race = 'goblin';
  // Human-only appearance (item 4) — see displayKind/effectiveSpriteKind.
  private gender: Gender | null = null;
  private hairColor: HairColor | null = null;
  private skinTone: SkinTone | null = null;
  // A slime's current mimicked appearance (see shared/skills.ts's
  // MIMIC_SKILL/REVERT_SKILL) — overrides race for texture/animation
  // lookups ONLY (see displayKind); race itself is always the true,
  // mechanical one.
  private mimicForm: (Race | MonsterKind) | null = null;
  private facing: Facing = 'down';
  private currentMap: MapName = 'Great Plains';
  private row = 0;
  private col = 0;
  private myUsername = '';
  private isMoving = false;
  private isPunching = false;
  private lastMoveAt = 0;
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Other connected players, static NPCs, wild monsters, and lootable
  // corpses sharing the current map — collision itself is enforced
  // server-side; these sprites are just the client's view of who else is
  // standing where (and what right-click/left-click can target). Each
  // living entity carries a small HP bar (a Graphics object stashed via
  // setData) repositioned every frame in update() so it tracks tweened
  // movement smoothly.
  private otherPlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private monsterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private corpseSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Shopkeepers etc. — static and never a combat target, so no HP bar and
  // no occupancy/collision handling beyond what the server already does.
  private vendorSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // The decorative shopfront stall standing in front of each vendor —
  // tracked separately purely so renderMap's map-transition cleanup can
  // destroy it alongside the vendor sprite itself.
  private vendorFrontSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Left-click target (see setTarget/handleLeftClick) — id is a username
  // for a player, otherwise the npc/monster's own id. Cleared whenever
  // the target dies/leaves/disconnects (see applyMapState's cleanup
  // loops).
  private targetKind: 'player' | 'npc' | 'monster' | null = null;
  private targetId: string | null = null;
  // Set when a right-click/action-bar skill use targets something too far
  // to hit yet — each move-cooldown tick walks one step closer (see
  // runApproachTick), then automatically engages once adjacent.
  private approach: { kind: 'player' | 'npc' | 'monster'; id: string; skill: string } | null = null;
  private lastApproachMoveAt = 0;
  // Great-Plains-only background dressing — server-enforced collision
  // (see shared/trees.ts), but no per-row depth sorting against
  // characters (always drawn behind them; see renderMap).
  private treeSprites: Phaser.GameObjects.Sprite[] = [];
  // Labyrinth-only decorative wall torches — recreated on every renderMap
  // the same way treeSprites are, just from torchWallPositionsFor instead
  // of treePositionsFor.
  private wallTorchSprites: Phaser.GameObjects.Sprite[] = [];

  private autopilotActive = false;
  private autopilotTargetKind: MonsterKind | null = null;
  private hasRenderedMap = false;

  constructor() {
    super('world');
  }

  init(data: { network: NetworkManager }): void {
    this.network = data.network;
  }

  preload(): void {
    this.load.svg('grass', '/grass-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('stone', '/stone-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('concrete', '/concrete-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('door', '/door.svg', { width: 40, height: 48 });
    this.load.svg(TREE_TEXTURE_KEY, '/tree.svg', { width: 48, height: 64 });
    this.load.svg(DAGGER_TEXTURE_KEY, '/dagger.svg', { width: 16, height: 16 });
    this.load.svg(BONE_SHIELD_TEXTURE_KEY, '/bone-shield.svg', { width: 16, height: 16 });
    this.load.svg(TORCH_HELD_TEXTURE_KEY, '/torch.svg', { width: 16, height: 20 });
    this.load.svg('shopfront', '/shopfront.svg', { width: 40, height: 36 });
    // Floro's shop buildings (item 11) — 2 frames (facing right / facing
    // left, see SHOP_BUILDING_FRAME_*) generated by tools/gen-shop-
    // assets.mjs since no Aseprite/pixel-mcp is available in this
    // environment; a real static PNG spritesheet loaded normally, same as
    // every other asset here, not drawn at runtime.
    this.load.spritesheet(SHOP_BUILDING_TEXTURE_KEY, '/shop-building-spritesheet.png', {
      frameWidth: SHOP_BUILDING_FRAME_WIDTH,
      frameHeight: SHOP_BUILDING_FRAME_HEIGHT,
    });
    // The shop entrance door (item 12) — 2 frames (closed / ajar, only
    // frame 0 used today) — separate texture from the plain 'door' used
    // by every other map transition in the project.
    this.load.spritesheet(WOODEN_DOOR_TEXTURE_KEY, '/wooden-door-spritesheet.png', {
      frameWidth: WOODEN_DOOR_FRAME_WIDTH,
      frameHeight: WOODEN_DOOR_FRAME_HEIGHT,
    });
    // Grimoak Castle's exterior + decorations (items 4 & 6) — real static
    // PNGs generated by tools/gen-castle-exterior.mjs, same reasoning as
    // the shop building above (no Aseprite/pixel-mcp available).
    this.load.image(CASTLE_EXTERIOR_TEXTURE_KEY, '/castle-exterior.png');
    this.load.image(CROW_TEXTURE_KEY, '/crow.png');
    this.load.image(FIREPLACE_TEXTURE_KEY, '/fireplace.png');
    this.load.image(STAIRS_TEXTURE_KEY, '/stairs.png');
    createWallTorchTexture(this);
    preloadCharacterSprites(this);
  }

  create(): void {
    createCharacterAnims(this);
    defineBodyPartFrames(this);

    this.player = this.add.sprite(0, 0, textureKeyFor('goblin'), idleFrameFor('goblin', 'down')).setScale(CHAR_SCALE);
    this.playerHpBar = this.add.graphics();
    this.playerManaBar = this.add.graphics();
    this.playerWeaponSprite = this.add.sprite(0, 0, DAGGER_TEXTURE_KEY).setVisible(false).setDepth(1);
    this.playerShieldSprite = this.add.sprite(0, 0, BONE_SHIELD_TEXTURE_KEY).setVisible(false).setDepth(1.5);
    this.playerTorchSprite = this.add.sprite(0, 0, TORCH_HELD_TEXTURE_KEY).setVisible(false).setDepth(1);

    // A 100x100 Great Plains is far too big to fit on screen at once —
    // the camera follows the player instead, clamped to each map's own
    // pixel bounds (set per-map in renderMap, since maps differ in size).
    this.cameras.main.startFollow(this.player, true, 1, 1);

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
      if (isInputCaptured()) return;
      if (pointer.rightButtonDown()) this.handleRightClick(pointer);
      else if (pointer.leftButtonDown()) this.handleLeftClick(pointer);
    });
    // A sword cursor over an enemy — monsters specifically, not other
    // players or the friendly training dummy. Individual sprites
    // (vendors, corpses) already get Phaser's own pointer cursor via
    // `useHandCursor`; this is a manual check since monster sprites
    // aren't `setInteractive` themselves (see findTargetableAt's own
    // bounds-based hit-testing).
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isInputCaptured()) {
        this.game.canvas.style.cursor = '';
        return;
      }
      const overEnemy = [...this.monsterSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      this.game.canvas.style.cursor = overEnemy ? SWORD_CURSOR : '';
    });

    // A window resize can cross the "map fits in the viewport" threshold
    // for the SAME map (see applyCameraBounds) — re-apply whenever it does.
    this.scale.on('resize', () => {
      if (!this.floorTile) return;
      const def = getMap(this.currentMap);
      this.applyCameraBounds(def.cols * TILE_SIZE, def.rows * TILE_SIZE);
    });

    this.network.addEventListener('sync', ((e: CustomEvent<SyncPayload>) => this.applySync(e.detail.player)) as EventListener);
    this.network.addEventListener('map:state', ((e: CustomEvent<MapStatePayload>) => this.applyMapState(e.detail)) as EventListener);
    this.network.addEventListener('punch', ((e: CustomEvent<PunchPayload>) => this.applyRemotePunch(e.detail)) as EventListener);
    this.network.addEventListener('combat', ((e: CustomEvent<CombatEventPayload>) => this.applyCombatEvent(e.detail)) as EventListener);
    this.network.addEventListener('chat', ((e: CustomEvent<ChatPayload>) => logChatMessage(e.detail.username, e.detail.message)) as EventListener);
    this.network.addEventListener('statTick', ((e: CustomEvent<StatTickPayload>) => this.applyOwnStats(e.detail)) as EventListener);
    this.network.addEventListener('worldTime', ((e: CustomEvent<WorldTimePayload>) => this.handleWorldTime(e.detail.hour, e.detail.tick)) as EventListener);
    this.network.addEventListener('kicked', ((e: CustomEvent<KickedPayload>) => {
      alert(e.detail.message);
      window.location.reload();
    }) as EventListener);

    setActiveScene(this);

    // Only connect the socket now that every listener above is actually
    // registered — startGame() used to connect immediately after
    // game.scene.add(), racing this scene's own preload (several
    // spritesheet fetches) to finish booting. On a fast/cached load the
    // server's very first 'sync' could arrive and fire into the void
    // before anything was listening for it (EventTarget doesn't replay
    // missed events), permanently starving this client of its own
    // race/position and — since applyMapState also refuses to do
    // anything until applySync has set myUsername — every monster/NPC/
    // other-player render too. This was the "always a goblin, no
    // monsters, screen never lights up" bug.
    this.network.connectSocket();
  }

  // Bundles the three separate things a fresh world-time broadcast drives
  // — the shared clock state, the cosmetic day/night tint, and the Eat
  // Brains button's cooldown gray-out — since they used to be one
  // function (updateWorldHour) before this module split.
  private handleWorldTime(hour: number, tick: number): void {
    setWorldTime(hour, tick);
    updateDaynightOverlay(hour);
    updateEatBrainsButton();
  }

  update(): void {
    this.repositionHpBars();
    this.updateDarkFog();
    applyDaynightTint(this.hasFullVision());

    if (this.isMoving || this.isPunching) return;

    if (this.autopilotActive) {
      if (this.manualMoveKeyDown()) {
        this.stopAutopilot('Autopilot stopped (manual movement).');
      } else {
        this.runAutopilotTick();
        return;
      }
    }

    if (this.approach) {
      if (this.manualMoveKeyDown()) {
        this.approach = null;
      } else {
        this.runApproachTick();
        return;
      }
    }

    if (isMovementBlocked()) return;

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

  // See modalCore.ts's updateInputCaptured comment — Phaser's global
  // keyboard capture preventDefaults on keycode alone, ignoring DOM
  // focus, so it has to be switched off while any HTML modal (with or
  // without a text input) is open and back on for normal play.
  setKeyCaptureEnabled(enabled: boolean): void {
    const manager = this.input.keyboard?.manager;
    if (manager) manager.preventDefault = enabled;
  }

  // Read by the map modal's "current world" tab/label — this.currentMap
  // is only ever updated inside renderMap, so it's always the map that's
  // ACTUALLY rendered right now, unlike myProfile.map (only refreshed on
  // 'sync', not on every walked transition).
  getCurrentMap(): MapName {
    return this.currentMap;
  }

  // Called after an equip/unequip so the held-weapon/shield overlays
  // update immediately rather than waiting for the next sync/map:state.
  refreshEquipmentSprites(): void {
    if (!myProfile) return;
    this.updateOwnWeaponSprite(Boolean(myProfile.equipment.weapon));
    this.updateOwnShieldSprite(myProfile.equipment.shield === 'bone shield');
    this.updateOwnTorchSprite(myProfile.equipment.shield === TORCH_ITEM);
  }

  // The local player's own weapon overlay uses the dedicated
  // playerWeaponSprite FIELD (repositioned every frame in
  // repositionHpBars), unlike the generic getData-based ensureWeaponSprite
  // used for other players/npcs/monsters. Calling ensureWeaponSprite on
  // this.player directly used to create a SEPARATE, second sprite (since
  // this.player had no 'weaponSprite' data key pointing at the field) —
  // that phantom only ever got repositioned when this method itself ran
  // (sync/equip events), never during ordinary movement, while the real,
  // per-frame-tracked field stayed permanently invisible. That was the
  // "dagger didn't move with me, only jumped on sit/rest" bug.
  private updateOwnWeaponSprite(hasWeapon: boolean): void {
    this.playerWeaponSprite.setVisible(hasWeapon);
    this.repositionWeaponSprite(this.playerWeaponSprite, this.player, this.facing);
  }

  private updateOwnShieldSprite(hasShield: boolean): void {
    this.playerShieldSprite.setVisible(hasShield);
    this.repositionShieldSprite(this.playerShieldSprite, this.player, this.facing);
  }

  // A torch fills the same off-hand slot as a bone shield (see
  // shared/lighting.ts) but is a completely different held item, so it
  // gets its own overlay sprite/visibility rather than reusing the
  // shield one — the two are mutually exclusive by construction (only
  // one item can occupy the shield slot), but there's no reason to
  // conflate them just because they share a slot. Reuses the shield's
  // own off-hand positioning math (see repositionShieldSprite) since
  // it's the same held position either way.
  private updateOwnTorchSprite(hasTorch: boolean): void {
    this.playerTorchSprite.setVisible(hasTorch);
    this.repositionShieldSprite(this.playerTorchSprite, this.player, this.facing);
  }

  // Sleeping is a static 90-degree "lying down" rotation (no dedicated
  // sprite art). Resting/sitting is a genuine looping animation instead —
  // a gentle squash-and-stretch "settling down" breathing tween — since
  // there's no separate sit-frame art either, but a rotation would look
  // wrong for "sitting up". Only re-applied when the state actually
  // changes (tracked via getData) so repeated map:state/sync ticks for
  // an unchanged restState don't restart the tween from scratch.
  private applyRestPose(sprite: Phaser.GameObjects.Sprite, restState: RestState, baseScale: number): void {
    if (sprite.getData('restState') === restState) return;
    sprite.setData('restState', restState);
    this.tweens.killTweensOf(sprite);
    sprite.setAngle(0);
    sprite.setScale(baseScale);

    if (restState === 'sleeping') {
      sprite.setAngle(90);
    } else if (restState === 'resting') {
      this.tweens.add({
        targets: sprite,
        scaleY: baseScale * 0.82,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private manualMoveKeyDown(): boolean {
    return (
      this.moveKeys.a.isDown ||
      this.moveKeys.d.isDown ||
      this.moveKeys.w.isDown ||
      this.moveKeys.s.isDown ||
      this.cursorKeys.left.isDown ||
      this.cursorKeys.right.isDown ||
      this.cursorKeys.up.isDown ||
      this.cursorKeys.down.isDown
    );
  }

  // ---------- Autopilot: a simple keyword-triggered "roam and punch the
  // nearest matching monster" loop. Not real language understanding —
  // just enough parsing (see autopilotModal.ts's parseAutopilotPrompt) to
  // pick a monster kind out of the typed sentence, then a greedy chase:
  // close the bigger of the row/col gaps each step, and punch once
  // actually adjacent. ----------

  startAutopilot(targetKind: MonsterKind): void {
    this.autopilotActive = true;
    this.autopilotTargetKind = targetKind;
    autopilotStatusEl.hidden = false;
    autopilotStatusEl.textContent = `Autopilot: hunting ${targetKind}s (Esc to stop)`;
    logCombatMessage(`Autopilot engaged: hunting ${targetKind}s.`);
  }

  stopAutopilot(reason?: string): void {
    if (!this.autopilotActive) return;
    this.autopilotActive = false;
    this.autopilotTargetKind = null;
    this.autopilotEngagedMonsterId = null;
    autopilotStatusEl.hidden = true;
    if (reason) logCombatMessage(reason);
  }

  private nearestMonsterOfKind(kind: MonsterKind): { id: string; row: number; col: number } | null {
    let best: { id: string; row: number; col: number } | null = null;
    let bestDist = Infinity;
    for (const [id, sprite] of this.monsterSprites) {
      if (sprite.getData('kind') !== kind) continue;
      const row = sprite.getData('row') as number;
      const col = sprite.getData('col') as number;
      const dist = Math.abs(row - this.row) + Math.abs(col - this.col);
      if (dist < bestDist) {
        bestDist = dist;
        best = { id, row, col };
      }
    }
    return best;
  }

  // Which monster autopilot is currently standing adjacent to and
  // considers itself "engaged" with (item 2) — set the moment it first
  // becomes adjacent, cleared the moment it's no longer adjacent to that
  // exact monster. While engaged, runAutopilotTick stops re-triggering the
  // punch animation on every single tick; the swing instead replays in
  // sync with each REAL combat-tick hit (see applyCombatEvent), since the
  // server's own combat tick keeps resolving hits on its fixed ~3s
  // schedule regardless of whether the client re-sends punch.
  private autopilotEngagedMonsterId: string | null = null;

  private runAutopilotTick(): void {
    const now = Date.now();
    if (now - this.lastMoveAt < MOVE_COOLDOWN_MS) return;

    const target = this.nearestMonsterOfKind(this.autopilotTargetKind!);
    if (!target) {
      this.autopilotEngagedMonsterId = null;
      this.stopAutopilot(`Autopilot: no ${this.autopilotTargetKind}s left here — stopping.`);
      return;
    }

    const dRow = target.row - this.row;
    const dCol = target.col - this.col;
    const adjacentOnAnAxis = (dRow === 0 && Math.abs(dCol) === 1) || (dCol === 0 && Math.abs(dRow) === 1);

    this.lastMoveAt = now;
    if (adjacentOnAnAxis) {
      const direction: Direction = dRow !== 0 ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
      if (this.autopilotEngagedMonsterId !== target.id) {
        // Newly adjacent to this exact monster — arm the combat session
        // and play one immediate swing as feedback that the attack
        // started. From here on the server resolves a hit every ~3s on
        // its own; we just wait, matching the animation to those real
        // hits instead of visually swinging every tick (item 2's "auto
        // attacking very fast" bug).
        this.autopilotEngagedMonsterId = target.id;
        this.performPunch(direction);
      } else {
        this.facing = facingForDirection(direction);
      }
      return;
    }

    this.autopilotEngagedMonsterId = null;
    // Greedy step toward the target along whichever axis has the bigger
    // gap; if a step is ever rejected (e.g. something's in the way), the
    // next tick just re-evaluates from wherever we ended up.
    const direction: Direction =
      Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
    this.attemptMove(direction);
  }

  private spriteMapFor(kind: 'player' | 'npc' | 'monster'): Map<string, Phaser.GameObjects.Sprite> {
    return kind === 'player' ? this.otherPlayers : kind === 'npc' ? this.npcSprites : this.monsterSprites;
  }

  // Right-click and the action bar both funnel through here: if the
  // target's already adjacent, throw the attack now; otherwise start (or
  // keep) walking toward it and let runApproachTick retry once in range.
  // Doesn't worry about obstacles — same "you navigate around doors/
  // walls yourself" tradeoff as autopilot's own greedy stepping.
  private tryEngage(kind: 'player' | 'npc' | 'monster', id: string, skill: string): void {
    const sprite = this.spriteMapFor(kind).get(id);
    if (!sprite) {
      this.approach = null;
      logCombatMessage('Your target is no longer here.');
      return;
    }

    const targetRow = sprite.getData('row') as number;
    const targetCol = sprite.getData('col') as number;
    const dRow = targetRow - this.row;
    const dCol = targetCol - this.col;

    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      this.approach = null;
      const direction: Direction = dRow === -1 ? 'north' : dRow === 1 ? 'south' : dCol === -1 ? 'west' : 'east';
      if (skill === PUNCH_SKILL || skill === DAGGER_SKILL) this.performPunch(direction);
      else this.performSkillAttack(direction, skill);
      return;
    }

    this.approach = { kind, id, skill };
  }

  private runApproachTick(): void {
    if (!this.approach) return;
    const now = Date.now();
    if (now - this.lastApproachMoveAt < MOVE_COOLDOWN_MS) return;
    if (this.isMoving || this.isPunching) return;

    const { kind, id, skill } = this.approach;
    const sprite = this.spriteMapFor(kind).get(id);
    if (!sprite) {
      this.approach = null;
      logCombatMessage('Your target is no longer here.');
      return;
    }

    const targetRow = sprite.getData('row') as number;
    const targetCol = sprite.getData('col') as number;
    const dRow = targetRow - this.row;
    const dCol = targetCol - this.col;

    this.lastApproachMoveAt = now;
    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      this.approach = null;
      this.tryEngage(kind, id, skill);
      return;
    }

    const direction: Direction =
      Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
    this.attemptMove(direction);
  }

  private repositionHpBars(): void {
    this.playerHpBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y);
    this.playerManaBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y + HP_BAR_HEIGHT + BAR_STACK_GAP);
    this.repositionWeaponSprite(this.playerWeaponSprite, this.player, this.facing);
    this.repositionShieldSprite(this.playerShieldSprite, this.player, this.facing);
    this.repositionShieldSprite(this.playerTorchSprite, this.player, this.facing);
    for (const sprite of this.otherPlayers.values()) this.repositionBarFor(sprite);
    for (const sprite of this.npcSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.monsterSprites.values()) this.repositionBarFor(sprite);
  }

  private repositionBarFor(sprite: Phaser.GameObjects.Sprite): void {
    const bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    bar?.setPosition(sprite.x, sprite.y + HP_BAR_OFFSET_Y);
    const weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (weaponSprite) this.repositionWeaponSprite(weaponSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
    const shieldSprite = sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined;
    if (shieldSprite) this.repositionShieldSprite(shieldSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
    const torchSprite = sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined;
    if (torchSprite) this.repositionShieldSprite(torchSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
  }

  // Own hp/mana bars are a 2-bar stack (show both above the player, not
  // just hp) — other players/NPCs/monsters keep the single hp-only bar,
  // since NpcSnapshot/MonsterSnapshot don't carry mana at all. Public
  // (not private) so module-level handlers that
  // mutate myProfile's vitals directly (eat brains, move acks, ...) can
  // keep this in sync too — several of those used to only refresh the
  // text status bar, leaving the graphical bar ABOVE the player stale
  // until the next sync/combat event.
  updateOwnBars(): void {
    if (!myProfile) return;
    drawHpBar(this.playerHpBar, myProfile.hp, myProfile.maxHp);
    drawStatBar(this.playerManaBar, myProfile.maxMana > 0 ? myProfile.mana / myProfile.maxMana : 0, MANA_BAR_COLOR);
  }

  private ensureHpBar(sprite: Phaser.GameObjects.Sprite, hp: number, maxHp: number): void {
    let bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    if (!bar) {
      bar = this.add.graphics();
      sprite.setData('hpBar', bar);
    }
    drawHpBar(bar, hp, maxHp);
  }

  // A fixed offset per facing direction — not aligned to individual
  // animation frames, just a reasonable "held near the hand" position.
  private weaponOffsetFor(facing: Facing): { x: number; y: number } {
    switch (facing) {
      case 'down':
        return { x: 10, y: 6 };
      case 'up':
        return { x: -10, y: -8 };
      case 'left':
        return { x: -13, y: 2 };
      case 'right':
        return { x: 13, y: 2 };
    }
  }

  // How long the punch/weapon swing animation actually runs (see
  // characterSprites.ts's PUNCH_FRAME_COUNT/frameRate: 4 frames @ 12fps)
  // — the weapon overlay's own outward-and-back thrust is timed to match
  // it exactly, peaking at the swing's midpoint via a sine curve rather
  // than a linear out-and-snap-back.
  private static readonly SWING_DURATION_MS = (4 / 12) * 1000;
  private static readonly SWING_THRUST_PX = 6;

  // `owner` carries its own swing-start timestamp (see performPunch/
  // performSkillAttack for the local player, applyRemotePunch/
  // playMonsterCounterAnim for everyone else) rather than this being
  // tracked per-scene, since many owners (every other player/monster on
  // the map) can be mid-swing at once.
  private swingOffsetFor(facing: Facing, owner: Phaser.GameObjects.Sprite): { x: number; y: number } {
    const startedAt = owner.getData('swingStartedAt') as number | undefined;
    if (startedAt === undefined) return { x: 0, y: 0 };
    const elapsed = Date.now() - startedAt;
    if (elapsed >= WorldScene.SWING_DURATION_MS) return { x: 0, y: 0 };
    const thrust = Math.sin((elapsed / WorldScene.SWING_DURATION_MS) * Math.PI) * WorldScene.SWING_THRUST_PX;
    switch (facing) {
      case 'down':
        return { x: 0, y: thrust };
      case 'up':
        return { x: 0, y: -thrust };
      case 'left':
        return { x: -thrust, y: 0 };
      case 'right':
        return { x: thrust, y: 0 };
    }
  }

  private repositionWeaponSprite(weaponSprite: Phaser.GameObjects.Sprite, owner: Phaser.GameObjects.Sprite, facing: Facing): void {
    const offset = this.weaponOffsetFor(facing);
    const swing = this.swingOffsetFor(facing, owner);
    weaponSprite.setPosition(owner.x + offset.x + swing.x, owner.y + offset.y + swing.y);
  }

  // Shows/hides a player's held-weapon overlay based on whether their
  // weapon slot is filled — called for self on every profile update and
  // for other players whenever their snapshot arrives.
  private ensureWeaponSprite(sprite: Phaser.GameObjects.Sprite, hasWeapon: boolean, facing: Facing): void {
    let weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!weaponSprite) {
      weaponSprite = this.add.sprite(sprite.x, sprite.y, DAGGER_TEXTURE_KEY).setDepth(1);
      sprite.setData('weaponSprite', weaponSprite);
    }
    sprite.setData('facing', facing);
    weaponSprite.setVisible(hasWeapon);
    this.repositionWeaponSprite(weaponSprite, sprite, facing);
  }

  // The shield overlay's offset is the weapon's own, mirrored — the
  // opposite arm from whatever's holding the weapon. Facing left/right
  // pulls the mirrored offset in a bit (rather than the full mirror
  // distance) so the shield reads as held in the OTHER arm, layered
  // slightly in front of the body — its overlay sprite is also created at
  // depth 1.5, above the weapon overlay's own depth 1, so it no longer
  // ties with it and unpredictably loses that tie.
  private static readonly SHIELD_SIDE_OFFSET_SCALE = 0.55;
  private shieldOffsetFor(facing: Facing): { x: number; y: number } {
    const weapon = this.weaponOffsetFor(facing);
    if (facing === 'left' || facing === 'right') {
      return { x: -weapon.x * WorldScene.SHIELD_SIDE_OFFSET_SCALE, y: weapon.y };
    }
    return { x: -weapon.x, y: weapon.y };
  }

  private repositionShieldSprite(shieldSprite: Phaser.GameObjects.Sprite, owner: Phaser.GameObjects.Sprite, facing: Facing): void {
    const offset = this.shieldOffsetFor(facing);
    shieldSprite.setPosition(owner.x + offset.x, owner.y + offset.y);
  }

  // Same shape as ensureWeaponSprite, but only for an actual "bone
  // shield" — a torch fills the same equipment slot (see
  // shared/lighting.ts) but isn't a shield and shouldn't render one.
  private ensureShieldSprite(sprite: Phaser.GameObjects.Sprite, hasShield: boolean, facing: Facing): void {
    let shieldSprite = sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!shieldSprite) {
      shieldSprite = this.add.sprite(sprite.x, sprite.y, BONE_SHIELD_TEXTURE_KEY).setDepth(1.5);
      sprite.setData('shieldSprite', shieldSprite);
    }
    shieldSprite.setVisible(hasShield);
    this.repositionShieldSprite(shieldSprite, sprite, facing);
  }

  // Same shape as ensureShieldSprite, for a torch instead — the same
  // off-hand slot, a different held item, so it's its own overlay rather
  // than reusing the shield one (see updateOwnTorchSprite).
  private ensureTorchSprite(sprite: Phaser.GameObjects.Sprite, hasTorch: boolean, facing: Facing): void {
    let torchSprite = sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!torchSprite) {
      torchSprite = this.add.sprite(sprite.x, sprite.y, TORCH_HELD_TEXTURE_KEY).setDepth(1);
      sprite.setData('torchSprite', torchSprite);
    }
    torchSprite.setVisible(hasTorch);
    this.repositionShieldSprite(torchSprite, sprite, facing);
  }

  private destroyEntitySprite(sprite: Phaser.GameObjects.Sprite): void {
    (sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined)?.destroy();
    (sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    (sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    (sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    sprite.destroy();
  }

  private tilePosition(row: number, col: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  // The kind actually rendered — a slime's mimicForm, if set, otherwise
  // its real race (resolved to the full gender/skin/hair composite for a
  // human — see effectiveSpriteKind). Every texture/animation lookup for
  // the LOCAL player goes through this instead of `race` directly.
  private displayKind(): SpriteKind {
    return this.mimicForm ?? effectiveSpriteKind(this.race, this.gender, this.skinTone, this.hairColor);
  }

  private setIdle(): void {
    this.player.anims.stop();
    this.player.setTexture(textureKeyFor(this.displayKind()), idleFrameFor(this.displayKind(), this.facing));
  }

  // Moves an existing other-player/monster sprite to its newly-reported
  // tile: tweened with a walk animation if it actually changed (derived
  // from the delta, since map:state only reports positions, not
  // directions), or left alone if it's standing pat. Turns what would
  // otherwise be an instant teleport-jump into something that reads as a
  // step.
  private moveOrSnap(sprite: Phaser.GameObjects.Sprite, kind: SpriteKind, row: number, col: number): void {
    const prevRow = sprite.getData('row') as number;
    const prevCol = sprite.getData('col') as number;
    sprite.setData('row', row);
    sprite.setData('col', col);

    if (sprite.getData('isPunching')) return;
    if (prevRow === row && prevCol === col) return;

    const dRow = row - prevRow;
    const dCol = col - prevCol;
    const facing: Facing = Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'up' : 'down') : dCol < 0 ? 'left' : 'right';
    sprite.setData('facing', facing);
    const pos = this.tilePosition(row, col);

    sprite.play(walkAnimKey(kind, facing), true);
    this.tweens.add({
      targets: sprite,
      x: pos.x,
      y: pos.y,
      duration: REMOTE_STEP_TWEEN_MS,
      onComplete: () => {
        sprite.anims.stop();
        sprite.setTexture(textureKeyFor(kind), idleFrameFor(kind, facing));
      },
    });
  }

  // Sets the camera's world bounds to the new map's pixel footprint and
  // swaps its floor texture/door position. The canvas itself stays fixed
  // at the browser window's size (see Phaser.Scale.RESIZE in startGame) —
  // the camera follows the player and is clamped to whichever map's
  // bounds are set here, so a small map and a huge one both just work
  // without the canvas itself changing size.
  // A map smaller than the current viewport (the Labyrinth at typical
  // window sizes, say) has nowhere to scroll to — followed normally, the
  // camera would just pin it into a corner instead of centering it. Only
  // follow the player when the map is actually big enough in that axis to
  // need scrolling; otherwise stop following and center the camera on the
  // map itself. Re-applied on window resize too, since resizing the
  // browser can cross that threshold either way for the same map.
  private applyCameraBounds(pixelWidth: number, pixelHeight: number): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, pixelWidth, pixelHeight);
    const fitsWidth = pixelWidth <= cam.width;
    const fitsHeight = pixelHeight <= cam.height;
    if (fitsWidth && fitsHeight) {
      cam.stopFollow();
      cam.centerOn(pixelWidth / 2, pixelHeight / 2);
    } else {
      cam.startFollow(this.player, true, 1, 1);
    }
  }

  private renderMap(mapName: MapName): void {
    this.currentMap = mapName;
    const def = getMap(mapName);
    const pixelWidth = def.cols * TILE_SIZE;
    const pixelHeight = def.rows * TILE_SIZE;

    this.applyCameraBounds(pixelWidth, pixelHeight);

    // Recreated from scratch (rather than reusing setSize() on the
    // existing tile sprite) — on the very first map load, resizing an
    // existing TileSprite from its initial placeholder size didn't
    // reliably take effect (the floor stayed tiny, top-left corner only,
    // until a later map transition happened to fix it). Building a fresh
    // one at the correct size from the start sidesteps that entirely.
    this.floorTile?.destroy();
    this.floorTile = this.add
      .tileSprite(0, 0, pixelWidth, pixelHeight, floorTextureFor(mapName))
      .setOrigin(0, 0)
      .setDepth(-1);

    // One door sprite per exit — Great Plains alone now has three
    // (Labyrinth/Floro/Kortho), so a single reused sprite (the old
    // approach, from when every map had at most one exit) would only ever
    // show the first. A shop-related exit (either a Floro-street door
    // leading INTO a shop, or any exit at all from inside a shop
    // interior, which always leads back out through its own door) uses
    // the reinforced wooden-door texture (item 12) instead of the plain
    // generic 'door' used everywhere else.
    const isShopDoorMap = (FLORO_SHOP_MAPS as readonly string[]).includes(mapName);
    for (const sprite of this.doorSprites) sprite.destroy();
    this.doorSprites = def.exits.map((exit) => {
      const pos = this.tilePosition(exit.row, exit.col);
      const isShopDoor = isShopDoorMap || (FLORO_SHOP_MAPS as readonly string[]).includes(exit.toMap);
      // Every reciprocal door pair lands you exactly on the tile that
      // triggers the return exit (see shared/maps.ts), so the player
      // stands ON a door sprite on every single transition. Without an
      // explicit depth, door sprites (recreated — and so re-inserted at
      // the top of the display list — on every renderMap call) rendered
      // OVER the player, hiding the sprite completely. Depth -0.5 keeps
      // them above the floor (-1) but below every character.
      if (exit.kind === 'stairs') return this.add.sprite(pos.x, pos.y, STAIRS_TEXTURE_KEY).setDepth(-0.5);
      return isShopDoor
        ? this.add.sprite(pos.x, pos.y, WOODEN_DOOR_TEXTURE_KEY, WOODEN_DOOR_CLOSED_FRAME).setDepth(-0.5)
        : this.add.sprite(pos.x, pos.y, 'door').setDepth(-0.5);
    });

    // The shop buildings themselves (item 13) — only rendered while
    // standing on Floro's own street (its 7 shop interiors don't need
    // their own exterior). One per shop door, positioned directly behind
    // it (one tile further from the street), mirrored to face whichever
    // way puts its entrance toward the town's own center column rather
    // than out toward the map edge.
    for (const sprite of this.shopBuildingSprites) sprite.destroy();
    this.shopBuildingSprites =
      mapName === 'Floro'
        ? def.exits
            .filter((exit) => (FLORO_SHOP_MAPS as readonly string[]).includes(exit.toMap))
            .map((exit) => {
              const pos = this.tilePosition(exit.row - 1, exit.col);
              const frame = exit.col < TOWN_MID_COL ? SHOP_BUILDING_FACING_RIGHT_FRAME : SHOP_BUILDING_FACING_LEFT_FRAME;
              return this.add
                .sprite(pos.x, pos.y, SHOP_BUILDING_TEXTURE_KEY, frame)
                .setOrigin(0.5, 1)
                .setDepth(-0.75);
            })
        : [];

    // Other entities belong to whichever map we just left — clear them
    // out immediately rather than waiting for the next map:state.
    for (const sprite of this.otherPlayers.values()) this.destroyEntitySprite(sprite);
    this.otherPlayers.clear();
    for (const sprite of this.npcSprites.values()) this.destroyEntitySprite(sprite);
    this.npcSprites.clear();
    for (const sprite of this.monsterSprites.values()) this.destroyEntitySprite(sprite);
    this.monsterSprites.clear();
    for (const sprite of this.corpseSprites.values()) sprite.destroy();
    this.corpseSprites.clear();
    for (const sprite of this.vendorSprites.values()) sprite.destroy();
    this.vendorSprites.clear();
    for (const sprite of this.vendorFrontSprites.values()) sprite.destroy();
    this.vendorFrontSprites.clear();

    // Great-Plains-only, fixed positions from the shared/trees.ts seed —
    // the server blocks movement onto these same tiles (see
    // WorldManagerService/MonsterManagerService), so this list must stay
    // byte-for-byte identical between client and server.
    for (const sprite of this.treeSprites) sprite.destroy();
    this.treeSprites = [];
    if (mapName === 'Great Plains') {
      for (const { row, col } of treePositionsFor(mapName)) {
        const pos = this.tilePosition(row, col);
        const sprite = this.add.sprite(pos.x, pos.y, TREE_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5);
        // A gentle sway tween (a whole crown swaying in a breeze) instead
        // of a multi-frame animation — the tree is a single static image
        // asset now (see assets/tree.svg), and a small back-and-forth
        // rotation reads the same way a sway spritesheet did. Randomized
        // start/duration per tree so they don't all sway in lockstep.
        this.tweens.add({
          targets: sprite,
          angle: { from: -2, to: 2 },
          duration: 3200 + Math.random() * 1600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.treeSprites.push(sprite);
      }
    }

    // Always-lit maps only (the Labyrinth) — purely decorative, giving
    // the visual reason it never goes dark. A gentle alpha flicker per
    // torch, each on its own randomized cycle so they don't all pulse in
    // lockstep.
    for (const sprite of this.wallTorchSprites) sprite.destroy();
    this.wallTorchSprites = [];
    for (const { row, col } of torchWallPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const sprite = this.add.sprite(pos.x, pos.y, WALL_TORCH_TEXTURE_KEY).setOrigin(0.5, 0.9).setDepth(-0.5);
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.75, to: 1 },
        duration: 400 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
      });
      this.wallTorchSprites.push(sprite);
    }

    // Grimoak Castle's exterior + flying crows (item 4) — only on the
    // Grounds, positioned directly behind (north of) the castle door so
    // its glowing archway lines up with the actual entrance tile.
    for (const sprite of this.castleExteriorSprites) sprite.destroy();
    for (const sprite of this.crowSprites) sprite.destroy();
    this.castleExteriorSprites = [];
    this.crowSprites = [];
    if (mapName === 'Grimoak Grounds') {
      const castleDoorExit = def.exits.find((exit) => exit.toMap === 'Grimoak Entrance Hall');
      if (castleDoorExit) {
        const pos = this.tilePosition(castleDoorExit.row, castleDoorExit.col);
        const castleSprite = this.add
          .sprite(pos.x, pos.y, CASTLE_EXTERIOR_TEXTURE_KEY)
          .setOrigin(0.5, 1)
          .setScale(CASTLE_EXTERIOR_SCALE)
          .setDepth(-0.75);
        this.castleExteriorSprites.push(castleSprite);

        // Crows looping near the tops of the two flanking towers — a
        // small tween-driven wander (not multi-frame animation) around a
        // fixed anchor point near each tower's spire. Anchor math uses the
        // castle's SCALED footprint (item 2), not its raw pixel size, so
        // the crows still line up with the towers now that the building
        // renders 5x bigger.
        const scaledWidth = CASTLE_EXTERIOR_WIDTH * CASTLE_EXTERIOR_SCALE;
        const scaledHeight = CASTLE_EXTERIOR_HEIGHT * CASTLE_EXTERIOR_SCALE;
        const topY = pos.y - scaledHeight + 200;
        const leftAnchorX = pos.x - scaledWidth / 2 + 250;
        const rightAnchorX = pos.x + scaledWidth / 2 - 250;
        for (const anchorX of [leftAnchorX, rightAnchorX]) {
          const crow = this.add.sprite(anchorX, topY, CROW_TEXTURE_KEY).setScale(2.5).setDepth(-0.7);
          this.tweens.add({
            targets: crow,
            x: { from: anchorX - 80, to: anchorX + 80 },
            y: { from: topY - 40, to: topY + 40 },
            duration: 3000 + Math.random() * 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          this.crowSprites.push(crow);
        }
      }
    }

    // A couple of fireplaces per castle interior room (item 6) — the
    // flame gets the same gentle alpha flicker the wall torches use.
    for (const sprite of this.fireplaceSprites) sprite.destroy();
    this.fireplaceSprites = [];
    for (const { row, col } of fireplacePositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const sprite = this.add.sprite(pos.x, pos.y, FIREPLACE_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5);
      // A much more pronounced flicker (item 3) than the wall torches'
      // own subtle one — a wide alpha swing PLUS a slight scale wobble,
      // each on its own fast, randomized cadence so no two fireplaces
      // (or the two flame beats within one) pulse in lockstep.
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.55, to: 1 },
        duration: 120 + Math.random() * 180,
        yoyo: true,
        repeat: -1,
      });
      this.tweens.add({
        targets: sprite,
        scaleX: { from: 0.92, to: 1.08 },
        scaleY: { from: 0.96, to: 1.04 },
        duration: 180 + Math.random() * 220,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.fireplaceSprites.push(sprite);
    }
  }

  private applySync(player: PlayerSnapshot): void {
    this.myUsername = player.username;
    this.race = player.race;
    this.gender = player.gender;
    this.hairColor = player.hairColor;
    this.skinTone = player.skinTone;
    this.mimicForm = player.mimicForm;
    this.row = player.row;
    this.col = player.col;
    setMyProfile(player);
    loadActionBarOnce(player.username);
    updateStatusBar();
    updateWorldLabel(player.map);
    notifyMapChanged();
    refreshOpenModals();

    // 'sync' fires on every level-up, not just map transitions — calling
    // renderMap unconditionally used to wipe every other-player/NPC/
    // monster/corpse sprite on ANY sync, which briefly made autopilot see
    // zero monsters and think it had run out of targets. Only actually
    // tear down and rebuild the map when the map itself changed.
    if (!this.hasRenderedMap || player.map !== this.currentMap) {
      this.renderMap(player.map);
      this.hasRenderedMap = true;
    }
    const pos = this.tilePosition(player.row, player.col);
    this.player.setPosition(pos.x, pos.y);
    // A sync can land mid-punch or mid-move (e.g. a level-up granted by
    // the very punch that's still animating). setIdle() below calls
    // anims.stop(), which — unlike letting an animation finish on its own
    // — never fires its 'animationcomplete' callback, so isPunching would
    // otherwise be stranded true forever, permanently freezing update()'s
    // very first `if (this.isMoving || this.isPunching) return;` guard
    // (the "WASD stopped working" symptom).
    this.isMoving = false;
    this.isPunching = false;
    this.setIdle();
    this.updateOwnBars();
    this.updateOwnWeaponSprite(Boolean(player.equipment.weapon));
    this.updateOwnShieldSprite(player.equipment.shield === 'bone shield');
    // A torch burning out clears equipment.shield server-side and emits
    // exactly this 'sync' — without this, the held-torch overlay would
    // keep showing in the player's hand even though vision itself already
    // correctly reverted (that part is purely reactive to
    // myProfile.equipment, recomputed fresh every frame).
    this.updateOwnTorchSprite(player.equipment.shield === TORCH_ITEM);
    this.applyRestPose(this.player, player.restState, CHAR_SCALE);
  }

  private applyMapState(state: MapStatePayload): void {
    // We don't know our own (server-canonical, exact-case) username until
    // the 'sync' event sets it — without this guard, a map:state that
    // somehow arrived first would fail to filter "us" out of the roster
    // and spawn a permanent, never-updated ghost duplicate of our own
    // sprite (always facing its default down/idle pose, since only real
    // *other* players get their facing driven by remote punches).
    if (!this.myUsername) return;
    // A map:state for whichever map we've already left/not yet entered
    // can arrive slightly out of order around a transition (the server
    // broadcasts to a room the instant this socket joins it, which can
    // race the move's own ack/renderMap on the client) — merging it in
    // would populate otherPlayers/npcSprites/monsterSprites/corpseSprites
    // with entries for the wrong map. Only apply a snapshot for the map
    // we're actually currently rendering.
    if (state.mapName !== this.currentMap) return;

    const seenPlayers = new Set<string>();
    for (const p of state.players) {
      if (p.username === this.myUsername) continue;
      seenPlayers.add(p.username);

      // A slime's mimicForm (if set) overrides its rendered appearance
      // entirely, while p.race stays the real, mechanical one underneath.
      const displayKind: SpriteKind = p.mimicForm ?? effectiveSpriteKind(p.race, p.gender, p.skinTone, p.hairColor);
      let sprite = this.otherPlayers.get(p.username);
      if (!sprite) {
        const pos = this.tilePosition(p.row, p.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(displayKind), idleFrameFor(displayKind, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', p.row);
        sprite.setData('col', p.col);
        this.otherPlayers.set(p.username, sprite);
      } else {
        this.moveOrSnap(sprite, displayKind, p.row, p.col);
      }
      // A mimic-form change while standing still (no move to trigger
      // moveOrSnap's own texture swap) needs its own immediate refresh.
      if (sprite.getData('displayKind') !== displayKind) {
        sprite.setData('displayKind', displayKind);
        if (!sprite.getData('isPunching')) {
          const facing = (sprite.getData('facing') as Facing) ?? 'down';
          sprite.setTexture(textureKeyFor(displayKind), idleFrameFor(displayKind, facing));
        }
      }
      sprite.setData('race', p.race);
      sprite.setData('gender', p.gender);
      sprite.setData('hairColor', p.hairColor);
      sprite.setData('skinTone', p.skinTone);
      sprite.setData('hasLight', p.hasLight);
      sprite.setData('label', p.username);
      sprite.setData('hp', p.hp);
      sprite.setData('maxHp', p.maxHp);
      sprite.setData('level', p.level);
      sprite.setData('equipment', p.equipment);
      this.ensureHpBar(sprite, p.hp, p.maxHp);
      this.ensureWeaponSprite(sprite, Boolean(p.equipment.weapon), (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, p.equipment.shield === 'bone shield', (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureTorchSprite(sprite, p.equipment.shield === TORCH_ITEM, (sprite.getData('facing') as Facing) ?? 'down');
      this.applyRestPose(sprite, p.restState, CHAR_SCALE);
      if (this.targetKind === 'player' && this.targetId === p.username) updateTargetPanel(p.username, p.level, p.hp, p.maxHp);
    }
    for (const [username, sprite] of this.otherPlayers) {
      if (!seenPlayers.has(username)) {
        this.destroyEntitySprite(sprite);
        this.otherPlayers.delete(username);
        if (this.targetKind === 'player' && this.targetId === username) this.clearTarget();
      }
    }

    for (const npc of state.npcs) {
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const pos = this.tilePosition(npc.row, npc.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(npc.race), idleFrameFor(npc.race, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', npc.row);
        sprite.setData('col', npc.col);
        this.npcSprites.set(npc.id, sprite);
      } else if (sprite.getData('row') !== npc.row || sprite.getData('col') !== npc.col) {
        // NPCs are normally static, but the training dummy now relocates
        // on "death" — that's a respawn teleport, not a walk, so snap
        // straight to the new tile rather than tweening a walk animation.
        sprite.setData('row', npc.row);
        sprite.setData('col', npc.col);
        const pos = this.tilePosition(npc.row, npc.col);
        sprite.setPosition(pos.x, pos.y);
      }
      sprite.setData('race', npc.race);
      sprite.setData('label', 'training dummy');
      sprite.setData('hp', npc.hp);
      sprite.setData('maxHp', npc.maxHp);
      sprite.setData('level', npc.level);
      this.ensureHpBar(sprite, npc.hp, npc.maxHp);
      if (this.targetKind === 'npc' && this.targetId === npc.id) updateTargetPanel('training dummy', npc.level, npc.hp, npc.maxHp);
    }

    const seenMonsters = new Set<string>();
    for (const m of state.monsters) {
      seenMonsters.add(m.id);

      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) {
        const pos = this.tilePosition(m.row, m.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(m.kind), idleFrameFor(m.kind, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', m.row);
        sprite.setData('col', m.col);
        this.monsterSprites.set(m.id, sprite);
      } else {
        this.moveOrSnap(sprite, m.kind, m.row, m.col);
      }
      sprite.setData('kind', m.kind);
      sprite.setData('label', m.kind);
      sprite.setData('hp', m.hp);
      sprite.setData('maxHp', m.maxHp);
      sprite.setData('level', m.level);
      sprite.setData('carriedItems', m.carriedItems);
      this.ensureHpBar(sprite, m.hp, m.maxHp);
      const hasWeapon = m.carriedItems.some((item) => item.toLowerCase().includes('dagger'));
      const hasShield = m.carriedItems.some((item) => item.toLowerCase().includes('shield'));
      this.ensureWeaponSprite(sprite, hasWeapon, (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, hasShield, (sprite.getData('facing') as Facing) ?? 'down');
      if (this.targetKind === 'monster' && this.targetId === m.id) updateTargetPanel(m.kind, m.level, m.hp, m.maxHp);
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(id);
        if (this.targetKind === 'monster' && this.targetId === id) this.clearTarget();
      }
    }

    const seenCorpses = new Set<string>();
    for (const c of state.corpses) {
      seenCorpses.add(c.id);
      if (this.corpseSprites.has(c.id)) continue;

      const pos = this.tilePosition(c.row, c.col);
      const sprite = this.add
        .sprite(pos.x, pos.y, textureKeyFor(c.kind), bodyPartFrameKey(c.kind))
        .setScale(CORPSE_SCALE)
        .setDepth(-1)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        // Every corpse (player, training dummy, or monster) opens the
        // same grab-all-or-pick-items loot modal — autopilot bypasses it
        // entirely below, grabbing straight away so automation doesn't
        // stall waiting on a modal.
        openCorpseModal(c.id, c.items, c.kind, c.killedBy);
      });
      this.corpseSprites.set(c.id, sprite);

      // Autopilot picks up after itself: a corpse it just created (from a
      // kill it just landed) is always within reach, since the punch
      // contact rule already requires standing adjacent to the target.
      if (this.autopilotActive && this.isWithinLootReach(c.row, c.col)) {
        this.lootCorpse(c.id, c.items, c.kind);
      }
    }
    for (const [id, sprite] of this.corpseSprites) {
      if (!seenCorpses.has(id)) {
        sprite.destroy();
        this.corpseSprites.delete(id);
      }
    }

    // Vendors are static and permanent for the lifetime of the map (never
    // added/removed by anything the client does), so this only ever needs
    // to create each one once, the first time it shows up in a snapshot.
    for (const v of state.vendors) {
      if (this.vendorSprites.has(v.id)) continue;

      // The shopfront stall sits directly in front of (one tile south
      // of) the shopkeeper, who stands behind it — decorative only, not
      // interactive/collidable.
      const frontPos = this.tilePosition(v.row + 1, v.col);
      const frontSprite = this.add.sprite(frontPos.x, frontPos.y, 'shopfront').setDepth(-0.5);
      this.vendorFrontSprites.set(v.id, frontSprite);

      const pos = this.tilePosition(v.row, v.col);
      const sprite = this.add
        .sprite(pos.x, pos.y, textureKeyFor('shopkeeper'), idleFrameFor('shopkeeper', 'down'))
        .setScale(CHAR_SCALE)
        .setInteractive({ useHandCursor: true });
      // Randomized appearance (phase 1) — a skin-tone tint over the
      // shared shopkeeper spritesheet; there's no separate male/female
      // sprite art yet, so gender is tracked as data (used for the
      // generated name) rather than a visual difference today.
      sprite.setTint(v.skinTint);
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        // Matches the server's own isClientWithinShopReach check — no
        // point opening a modal whose Buy button would just fail anyway,
        // and the message is clearer about why nothing happened.
        if (!isWithinRadius(this.row, this.col, v.row, v.col, SHOP_REACH_TILES)) {
          logCombatMessage("You're too far away to reach the shop.");
          return;
        }
        openShopModal(v);
      });
      this.vendorSprites.set(v.id, sprite);
    }
  }

  // True either because the player can see everywhere themselves
  // (infravision — strictly better than a torch, which only lights a
  // small radius, see hasLocalLight below) or because the map itself is
  // always lit regardless of who's standing in it (the torch-lined
  // Labyrinth). Matches shared/lighting.ts's hasFullVision for the
  // infravision half of this.
  private hasFullVision(): boolean {
    if (isAlwaysLit(this.currentMap)) return true;
    return myProfile ? myProfile.skills[INFRAVISION_SKILL] !== undefined : false;
  }

  // True if the local player has a LOCAL-radius-only light source — their
  // own carried torch, a nearby ally's carried torch (a torch is the only
  // thing that actually emits light others can share in — see
  // shared/lighting.ts's emitsLight), or standing near a static fixture.
  private hasLocalLight(): boolean {
    if (!myProfile) return false;
    if (myProfile.equipment.shield === TORCH_ITEM) return true;
    if (isNearStaticLight(this.currentMap, this.row, this.col)) return true;
    for (const sprite of this.otherPlayers.values()) {
      if (!sprite.getData('hasLight')) continue;
      const otherRow = sprite.getData('row') as number;
      const otherCol = sprite.getData('col') as number;
      if (isWithinLightRadius(this.row, this.col, otherRow, otherCol)) return true;
    }
    return false;
  }

  // Drives the #dark-fog-overlay DOM element every frame — cheap (just a
  // CSS background string), and simplest kept here rather than adding a
  // dedicated "did anything actually change" cache. Three tiers: full
  // vision (infravision) clears the whole screen; local light (torch/
  // ally/static fixture) clears only a small radius; no light at all
  // clears barely more than the player's own tile.
  private updateDarkFog(): void {
    if (!worldTimeKnown || !myProfile || !isDarkHour(currentWorldHour) || this.hasFullVision()) {
      hideDarkFog();
      return;
    }
    const cam = this.cameras.main;
    const screenX = (this.player.x - cam.scrollX) * cam.zoom;
    const screenY = (this.player.y - cam.scrollY) * cam.zoom;
    const radiusTiles = this.hasLocalLight() ? LIGHT_RADIUS_TILES : NO_LIGHT_RADIUS_TILES;
    const radiusPx = radiusTiles * TILE_SIZE * cam.zoom;
    showDarkFog(screenX, screenY, radiusPx);
  }

  private isWithinLootReach(row: number, col: number): boolean {
    return Math.abs(row - this.row) <= 1 && Math.abs(col - this.col) <= 1;
  }

  // `kind` is only passed by the autopilot call site — used purely to
  // decide whether to also auto-sacrifice afterward, so a manual
  // (non-autopilot) loot never triggers it.
  private lootCorpse(corpseId: string, items: string[], kind?: string): void {
    this.network
      .loot(corpseId)
      .then((ack) => {
        if (!ack.ok) {
          if (ack.message) logCombatMessage(ack.message);
          return;
        }
        if (myProfile && ack.inventory) {
          setMyProfile({ ...myProfile, inventory: ack.inventory });
          refreshOpenModals();
        }
        if (items.length > 0) logCombatMessage(`You pick up the ${items.join(' and ')}.`);

        // Only a real monster corpse can be sacrificed at all — a
        // player/training-dummy corpse is just left as-is.
        if (this.autopilotActive && kind !== undefined && (MONSTER_KINDS as readonly string[]).includes(kind)) {
          this.network
            .sacrificeCorpse(corpseId)
            .then((sacrificeAck) => {
              if (!sacrificeAck.ok) {
                if (sacrificeAck.message) logCombatMessage(sacrificeAck.message);
                return;
              }
              if (myProfile && sacrificeAck.gold !== undefined) {
                setMyProfile({ ...myProfile, gold: sacrificeAck.gold });
                updateStatusBar();
              }
              if (sacrificeAck.message) logCombatMessage(sacrificeAck.message);
            })
            .catch(() => {
              /* nothing to show */
            });
        }
      })
      .catch(() => {
        /* corpse likely already looted by someone else — nothing to show */
      });
  }

  private attemptMove(direction: Direction): void {
    this.facing = facingForDirection(direction);
    this.player.play(walkAnimKey(this.displayKind(), this.facing), true);
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
          this.gender = ack.player.gender;
          this.hairColor = ack.player.hairColor;
          this.skinTone = ack.player.skinTone;
          this.mimicForm = ack.player.mimicForm;
          if (myProfile) setMyProfile({ ...myProfile, map: ack.player.map });
          this.renderMap(ack.player.map);
          updateWorldLabel(ack.player.map);
          notifyMapChanged();
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
  // selects it as your target and engages combat with your default
  // attack (punch, or your equipped weapon's skill) — if it's already
  // adjacent that arms the next combat tick immediately; if not, walks
  // you toward it first and engages once in range.
  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isMoving || this.isPunching) return;
    const found = this.findTargetableAt(pointer.worldX, pointer.worldY);
    if (!found) return;

    this.setTarget(found.kind, found.id, found.sprite);
    const defaultSkill = myProfile?.equipment.weapon?.toLowerCase().includes('dagger') ? DAGGER_SKILL : PUNCH_SKILL;
    this.tryEngage(found.kind, found.id, defaultSkill);
  }

  // Left click anywhere a player/npc/monster sprite's bounds cover sets
  // it as the current target — deliberately not gated on reach/adjacency
  // the way punch is, since selecting a target you're about to walk
  // toward is normal play.
  private findTargetableAt(
    x: number,
    y: number
  ): { kind: 'player' | 'npc' | 'monster'; id: string; sprite: Phaser.GameObjects.Sprite } | null {
    for (const [username, sprite] of this.otherPlayers) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'player', id: username, sprite };
    }
    for (const [id, sprite] of this.npcSprites) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'npc', id, sprite };
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'monster', id, sprite };
    }
    return null;
  }

  private lastClickKey: string | null = null;
  private lastClickAt = 0;
  private static readonly DOUBLE_CLICK_MS = 350;

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    const found = this.findTargetableAt(pointer.worldX, pointer.worldY);
    if (!found) {
      // Clicking empty ground deselects whatever was targeted — but a
      // click that actually landed on a corpse or vendor (handled
      // entirely by their own pointerdown listeners) isn't "empty
      // ground", just not a combat-targetable entity; leave the target
      // alone.
      const hitOther = [...this.corpseSprites.values(), ...this.vendorSprites.values()].some((s) =>
        s.getBounds().contains(pointer.worldX, pointer.worldY)
      );
      if (!hitOther && this.targetKind) this.clearTarget();
      return;
    }
    this.setTarget(found.kind, found.id, found.sprite);

    const key = `${found.kind}:${found.id}`;
    const now = Date.now();
    if (this.lastClickKey === key && now - this.lastClickAt < WorldScene.DOUBLE_CLICK_MS) {
      this.lastClickKey = null;
      openTargetInfoModal(found.kind, found.id, found.sprite);
    } else {
      this.lastClickKey = key;
      this.lastClickAt = now;
    }
  }

  private setTarget(kind: 'player' | 'npc' | 'monster', id: string, sprite: Phaser.GameObjects.Sprite): void {
    this.targetKind = kind;
    this.targetId = id;
    const label = (sprite.getData('label') as string | undefined) ?? id;
    const level = (sprite.getData('level') as number | undefined) ?? 1;
    const hp = (sprite.getData('hp') as number | undefined) ?? 0;
    const maxHp = (sprite.getData('maxHp') as number | undefined) ?? 1;
    updateTargetPanel(label, level, hp, maxHp);
  }

  private clearTarget(): void {
    this.targetKind = null;
    this.targetId = null;
    hideTargetPanel();
  }

  // Read by the action bar when a slotted skill is clicked — "the
  // currently selected target," if any.
  getTarget(): { kind: 'player' | 'npc' | 'monster'; id: string } | null {
    if (!this.targetKind || !this.targetId) return null;
    return { kind: this.targetKind, id: this.targetId };
  }

  // The action bar's click handler for a filled slot — engages the
  // currently selected target with this exact skill. If it's out of
  // range, tryEngage starts walking toward it instead of just refusing,
  // same as a right-click does for the default attack.
  useTargetedSkill(skillName: string): void {
    // Mimic/revert aren't combat actions at all — no target needed, they
    // just drive the existing /mimic and /revert chat commands. Revert
    // takes no argument, so it fires immediately; mimic needs a target
    // race/monster name typed in, so it just pre-fills the command
    // instead of guessing which one they meant.
    if (skillName === REVERT_SKILL) {
      this.network.chat('/revert');
      return;
    }
    if (skillName === MIMIC_SKILL) {
      openChatInputWithText('/mimic ');
      return;
    }

    if (!this.targetKind || !this.targetId) {
      logCombatMessage('Select a target first (left-click a player or monster).');
      return;
    }
    if (skillName === PUNCH_SKILL && myProfile?.equipment.weapon) {
      // Bare-handed only — wielding any weapon means there's a real
      // attack to throw instead (the dagger skill, or just the default
      // contact attack, both of which already apply the weapon's own
      // bonus damage server-side).
      logCombatMessage("You can't punch while wielding a weapon.");
      return;
    }
    if (this.isMoving || this.isPunching) return;

    this.tryEngage(this.targetKind, this.targetId, skillName);
  }

  // The local player's own swing animation — shared by performPunch/
  // performSkillAttack (an immediate, cosmetic engage-feedback swing) AND
  // by applyCombatEvent's autopilot branch (item 2: replaying the swing
  // in sync with each REAL server-resolved hit, instead of re-triggering
  // it every autopilot tick regardless of whether a hit actually landed).
  private playOwnSwingAnim(facing: Facing): void {
    this.facing = facing;
    const animKey = punchAnimKey(this.displayKind(), facing);

    this.isPunching = true;
    this.player.setData('swingStartedAt', Date.now());
    this.player.play(animKey, true);
    this.player.once(`animationcomplete-${animKey}`, () => {
      this.isPunching = false;
      this.setIdle();
    });
  }

  private performPunch(direction: Direction): void {
    this.playOwnSwingAnim(facingForDirection(direction));
    this.network.punch(direction);
  }

  // Same swing animation as performPunch — no dedicated art per skill —
  // but dispatches the useSkill socket event naming exactly which learned
  // skill to queue (bone finger strike, glare) instead of the default
  // punch/dagger.
  private performSkillAttack(direction: Direction, skill: string): void {
    this.playOwnSwingAnim(facingForDirection(direction));
    this.network.useSkill(direction, skill);
  }

  private applyRemotePunch({ username, direction }: PunchPayload): void {
    const sprite = this.otherPlayers.get(username);
    if (!sprite) return;

    const race = sprite.getData('race') as Race;
    const kind = effectiveSpriteKind(
      race,
      (sprite.getData('gender') as Gender | null) ?? null,
      (sprite.getData('skinTone') as SkinTone | null) ?? null,
      (sprite.getData('hairColor') as HairColor | null) ?? null
    );
    const facing = facingForDirection(direction);
    const animKey = punchAnimKey(kind, facing);

    sprite.setData('isPunching', true);
    sprite.setData('swingStartedAt', Date.now());
    sprite.play(animKey, true);
    sprite.once(`animationcomplete-${animKey}`, () => {
      sprite.setData('isPunching', false);
      sprite.setTexture(textureKeyFor(kind), idleFrameFor(kind, 'down'));
    });
  }

  // Which way a sprite standing at (fromRow, fromCol) should face to look
  // at (toRow, toCol) — same dominant-axis logic moveOrSnap already uses
  // for walking, reused here so a monster visibly turns toward whoever
  // just hit it instead of staying frozen in its last wander direction.
  private directionToward(fromRow: number, fromCol: number, toRow: number, toCol: number): Facing {
    const dRow = toRow - fromRow;
    const dCol = toCol - fromCol;
    if (Math.abs(dRow) >= Math.abs(dCol)) return dRow <= 0 ? 'up' : 'down';
    return dCol <= 0 ? 'left' : 'right';
  }

  // The current tile of whoever landed a hit (self, or another player
  // visible on this same map) — used to turn a monster to face its
  // attacker. Returns null for an attacker we have no visible position
  // for (e.g. a monster attacking someone on a different map, in the rare
  // case a combat event still reached us).
  private attackerPosition(username: string): { row: number; col: number } | null {
    if (username === this.myUsername) return { row: this.row, col: this.col };
    const sprite = this.otherPlayers.get(username);
    if (!sprite) return null;
    return { row: sprite.getData('row') as number, col: sprite.getData('col') as number };
  }

  // Plays a monster's own punch/weapon-swing animation facing the given
  // direction — representing its counter-attack. The combat-tick
  // architecture resolves a player's swing and the monster's own
  // retaliation together in one exchange (see game.gateway.ts's
  // resolveHitOnMonster/resolveMonsterCounterAttack), so every non-fatal
  // 'combat' event against a monster represents an attempted counter
  // worth animating.
  private playMonsterCounterAnim(sprite: Phaser.GameObjects.Sprite, kind: MonsterKind, facing: Facing): void {
    sprite.setData('facing', facing);
    if (sprite.getData('isPunching')) return; // already mid-swing — let it finish rather than restarting
    const animKey = punchAnimKey(kind, facing);
    sprite.setData('isPunching', true);
    sprite.setData('swingStartedAt', Date.now());
    sprite.play(animKey, true);
    sprite.once(`animationcomplete-${animKey}`, () => {
      sprite.setData('isPunching', false);
      sprite.setTexture(textureKeyFor(kind), idleFrameFor(kind, facing));
    });
  }

  // The server resolves damage/exp/leveling and broadcasts the outcome —
  // this just reflects it: a combat-log line, and an immediate HP-bar/
  // status-bar update rather than waiting for the next map:state tick.
  private applyCombatEvent(event: CombatEventPayload): void {
    // Deselect a target the instant it dies — covers monster/npc/player
    // kills alike, including cases (an NPC dummy relocating, a killed
    // player respawning elsewhere) where the entity doesn't actually
    // disappear from the next map:state, so the removal-based cleanup in
    // applyMapState would never have caught it.
    if (event.targetDied && this.targetKind === event.targetKind && this.targetId === event.target) {
      this.clearTarget();
    }

    // Only auto-switch tabs for a fight the player is actually in — not
    // for every combat line broadcast to the room from someone else's.
    const involvesMe = event.attacker === this.myUsername || (event.targetKind === 'player' && event.target === this.myUsername);
    if (involvesMe) noteCombatActivity();
    const logKind = event.targetDied ? 'death' : event.leveledUp ? 'level-up' : undefined;
    logCombatMessage(event.message, logKind);
    if (event.leveledUp && event.attacker === this.myUsername) {
      logCombatMessage(`${this.myUsername} reaches level ${event.attackerLevel}!`, 'level-up');
    }
    for (const growthMessage of event.growthMessages ?? []) {
      logCombatMessage(growthMessage, 'level-up');
      // Item 1: a skill-percent-growth notice (not the OTHER kinds of
      // flavor lines that share this same array — "second attack
      // triggers!", a glare paralysis notice, ...) additionally pops up
      // as a center-screen toast, but only for the LOCAL player's own
      // growth — not for every combat line broadcast to the room from
      // someone else's fight.
      if (event.attacker === this.myUsername && /skill has increased to \d+%!/.test(growthMessage)) {
        showCenterToast(growthMessage);
      }
    }

    if (event.attacker === this.myUsername) {
      this.applyOwnStats({
        level: event.attackerLevel,
        exp: event.attackerExp,
        hp: event.attackerHp,
        maxHp: event.attackerMaxHp,
        skills: event.attackerSkills ?? myProfile?.skills,
      });
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
      // Item 2: while autopilot is engaged with this exact monster, this
      // is what actually plays the local player's swing animation now —
      // in sync with the real combat-tick hit the server just resolved,
      // instead of runAutopilotTick re-triggering it every single tick
      // regardless of whether a hit landed (the "auto attacking very
      // fast" bug). Manual play is unaffected — performPunch already
      // played its own immediate feedback swing when the attack was
      // thrown, so this only fires for autopilot's engaged target.
      if (this.autopilotActive && event.attacker === this.myUsername && this.autopilotEngagedMonsterId === event.target && !this.isPunching) {
        const facing = this.directionToward(this.row, this.col, sprite.getData('row') as number, sprite.getData('col') as number);
        this.playOwnSwingAnim(facing);
      }
      if (event.targetDied) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(event.target);
      } else {
        this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
        // A monster that survives a hit turns to face whoever hit it and
        // plays its own punch animation for the counter-attack that same
        // exchange represents, instead of standing frozen facing
        // whichever way it last happened to wander.
        const attackerPos = this.attackerPosition(event.attacker);
        if (attackerPos) {
          const facing = this.directionToward(
            sprite.getData('row') as number,
            sprite.getData('col') as number,
            attackerPos.row,
            attackerPos.col
          );
          this.playMonsterCounterAnim(sprite, sprite.getData('kind') as MonsterKind, facing);
        }
      }
    } else if (event.targetKind === 'player') {
      const sprite = this.otherPlayers.get(event.target);
      if (sprite) this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
    }
  }

  private applyOwnStats(updates: Partial<PlayerSnapshot>): void {
    if (!myProfile) return;
    setMyProfile({ ...myProfile, ...updates });
    this.updateOwnBars();
    updateStatusBar();
    refreshOpenModals();
  }
}
