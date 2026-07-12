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
import {
  getMap,
  MAPS,
  TOWN_MID_COL,
  MOAT_OUTER_TOP,
  MOAT_OUTER_BOTTOM,
  MOAT_OUTER_LEFT,
  MOAT_OUTER_RIGHT,
  MOAT_INNER_TOP,
  MOAT_INNER_BOTTOM,
  MOAT_INNER_LEFT,
  MOAT_INNER_RIGHT,
  BRIDGE_COL_LEFT,
  BRIDGE_COL_RIGHT,
} from '../../shared/maps.js';
import { treePositionsFor } from '../../shared/trees.js';
import {
  PUNCH_SKILL,
  DAGGER_SKILL,
  MIMIC_SKILL,
  REVERT_SKILL,
  INFRAVISION_SKILL,
  LUCEM_SKILL,
  IRRIGO_SKILL,
  CELERITAS_SKILL,
  AUGUE_SKILL,
  DRINK_SKILL,
  POUR_SKILL,
} from '../../shared/skills.js';
import {
  isDarkHour,
  LIGHT_RADIUS_TILES,
  LUCEM_LIGHT_RADIUS_TILES,
  SHOP_REACH_TILES,
  staticLightRadiusAt,
  isWithinLightRadius,
  isWithinRadius,
  TORCH_ITEM,
  isAlwaysLit,
  torchWallPositionsFor,
  fireplacePositionsFor,
  studentDeskPositionsFor,
  benchPositionsFor,
} from '../../shared/lighting.js';
import { MONSTER_KINDS, FLORO_SHOP_MAPS, GRIMOAK_CASTLE_MAPS, CLASSROOM_MAPS } from '../../shared/constants.js';
import { WAND_ITEM } from '../../shared/equipment.js';
import {
  LUCEM_BOOK_MAP,
  LUCEM_BOOK_POSITION,
  LUCEM_BOOK_LABEL,
  IRRIGO_BOOK_MAP,
  IRRIGO_BOOK_POSITION,
  IRRIGO_BOOK_LABEL,
  CELERITAS_BOOK_MAP,
  CELERITAS_BOOK_POSITION,
  CELERITAS_BOOK_LABEL,
  AUGUE_BOOK_MAP,
  AUGUE_BOOK_POSITION,
  AUGUE_BOOK_LABEL,
} from '../../shared/spells.js';
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
  CASTLE_TOWER_X_FRACTIONS,
  CASTLE_TOWER_TOP_FRACTION,
  CHAR_SCALE,
  CLASSROOM_DESK_TEXTURE_KEY,
  SPELLBOOK_PODIUM_TEXTURE_KEY,
  BENCH_TEXTURE_KEY,
  CLASSROOM_ZOOM,
  CORPSE_SCALE,
  CROW_TEXTURE_KEY,
  DAGGER_TEXTURE_KEY,
  type Facing,
  FIREPLACE_MANTLE_TEXTURE_KEY,
  FIREPLACE_FLAME_TEXTURE_KEY,
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
  FEATHER_CURSOR,
  TILE_SIZE,
  TORCH_HELD_TEXTURE_KEY,
  WAND_TEXTURE_KEY,
  WAND_GLOW_RADIUS_PX,
  WAND_GLOW_COLOR,
  TREE_TEXTURE_KEY,
  STAIRS_TEXTURE_KEY,
  GRAND_DOOR_TEXTURE_KEY,
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
  updateWorldTimeLabel,
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
  private playerWandSprite!: Phaser.GameObjects.Sprite;
  // The lucem glow at the wand's own tip (item 12) — a small Graphics
  // circle rather than a sprite (see mapRender.ts's WAND_GLOW_RADIUS_PX),
  // shown only while myProfile.wandLit is true.
  private playerWandGlow!: Phaser.GameObjects.Graphics;
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
  // The moat ring + its bridge (a follow-up ask) — only populated on
  // 'Grimoak Grounds', plain Graphics fills rather than sprite assets
  // (same "Graphics for a simple geometric effect" treatment the dark-fog/
  // hp-bar overlays already use).
  private moatGraphics: Phaser.GameObjects.Graphics | null = null;
  private bridgeGraphics: Phaser.GameObjects.Graphics | null = null;
  private fireplaceSprites: Phaser.GameObjects.Sprite[] = [];
  // 4 student desks per classroom (a follow-up ask) — reuses the same
  // desk texture the teacher's own desk uses (see teacherDeskSprites),
  // just placed at studentDeskPositionsFor's fixed positions instead.
  private studentDeskSprites: Phaser.GameObjects.Sprite[] = [];
  // A social gathering spot's benches (a follow-up ask upgraded these
  // from plain chairs) — Entrance Hall and common-room-only, see
  // shared/lighting.ts's benchPositionsFor.
  private benchSprites: Phaser.GameObjects.Sprite[] = [];
  // The Utilization classroom's clickable spellbook podium (item 8) —
  // only ever populated while rendering that one map.
  private spellbookPodiumSprite: Phaser.GameObjects.Sprite | null = null;
  // Elemental Casting's own podium, teaching irrigo — a second, separate
  // instance of the same mechanic (see renderSpellPodium).
  private irrigoPodiumSprite: Phaser.GameObjects.Sprite | null = null;
  // Utilization's SECOND podium (a follow-up ask), teaching quick
  // movement — stands right next to spellbookPodiumSprite.
  private celeritasPodiumSprite: Phaser.GameObjects.Sprite | null = null;
  // The Offense classroom's own podium (a later follow-up ask), teaching
  // augue.
  private auguePodiumSprite: Phaser.GameObjects.Sprite | null = null;
  // Each podium's own small floating label (item 8's follow-up ask) —
  // tracked in lockstep with the 4 podium sprites above purely so
  // map-transition cleanup destroys them together.
  private podiumLabelSprites: Phaser.GameObjects.Text[] = [];
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
  // Classroom teachers — same "static, never a combat target" shape as
  // vendors, no HP bar; collision is server-side only (see
  // world-manager.service.ts), nothing for the client to enforce.
  private teacherSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Each teacher's own desk, tracked separately so map-transition cleanup
  // destroys it alongside the teacher sprite itself (same shape as
  // vendorFrontSprites above).
  private teacherDeskSprites = new Map<string, Phaser.GameObjects.Sprite>();
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
    this.load.svg(TREE_TEXTURE_KEY, '/tree.svg', { width: 48, height: 64 });
    this.load.svg(DAGGER_TEXTURE_KEY, '/dagger.svg', { width: 16, height: 16 });
    this.load.svg(BONE_SHIELD_TEXTURE_KEY, '/bone-shield.svg', { width: 16, height: 16 });
    this.load.svg(TORCH_HELD_TEXTURE_KEY, '/torch.svg', { width: 16, height: 20 });
    this.load.svg(WAND_TEXTURE_KEY, '/wand.svg', { width: 16, height: 16 });
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
    // A single fancy double door (a follow-up ask), used for every map
    // exit now — shop doors and every other transition alike.
    this.load.image(GRAND_DOOR_TEXTURE_KEY, '/grand-door.png');
    // Grimoak Castle's exterior + decorations (items 4 & 6) — real static
    // PNGs generated by tools/gen-castle-exterior.mjs, same reasoning as
    // the shop building above (no Aseprite/pixel-mcp available).
    this.load.image(CASTLE_EXTERIOR_TEXTURE_KEY, '/castle-exterior.png');
    this.load.image(CROW_TEXTURE_KEY, '/crow.png');
    this.load.image(FIREPLACE_MANTLE_TEXTURE_KEY, '/fireplace-mantle.png');
    this.load.image(FIREPLACE_FLAME_TEXTURE_KEY, '/fireplace-flame.png');
    this.load.image(STAIRS_TEXTURE_KEY, '/stairs.png');
    this.load.image(CLASSROOM_DESK_TEXTURE_KEY, '/classroom-desk.png');
    this.load.image(SPELLBOOK_PODIUM_TEXTURE_KEY, '/spellbook-podium.png');
    this.load.image(BENCH_TEXTURE_KEY, '/bench.png');
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
    this.playerWandSprite = this.add.sprite(0, 0, WAND_TEXTURE_KEY).setVisible(false).setDepth(1);
    this.playerWandGlow = this.add.graphics().setVisible(false).setDepth(1.1);

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

    // ===== TESTING OVERRIDE — REMOVE AFTER TESTING ===== "add a 'cheat'
    // hotkey, which will be the tilde '~' key. Pressing it should recover
    // my mana to 100%. This will go away after testing." Delete this
    // whole keydown listener (and net.ts's cheatFullMana/game.gateway.ts's
    // handleCheatFullMana) once testing wraps up.
    keyboard.on('keydown-BACKTICK', () => {
      if (isInputCaptured()) return;
      void this.network.cheatFullMana().then((sync) => {
        setMyProfile(sync.player);
        this.updateOwnBars();
        logCombatMessage('[cheat] Mana restored to full.');
      });
    });

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
      const overPodium =
        Boolean(this.spellbookPodiumSprite?.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        Boolean(this.irrigoPodiumSprite?.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        Boolean(this.celeritasPodiumSprite?.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        Boolean(this.auguePodiumSprite?.getBounds().contains(pointer.worldX, pointer.worldY));
      // A teacher's own `useHandCursor` (set on their sprite below) never
      // actually showed — this SAME pointermove handler fires on every
      // mouse move and unconditionally reset the cursor back to '' right
      // after Phaser's own pointerover set it to 'pointer' (a follow-up
      // bug fix: "make it tooltip cursor" turned out to require teaching
      // THIS handler about teachers too, not the sprite itself). A 'help'
      // cursor (a "?" — see appendStatRow's own use of the same cursor for
      // a tooltip-bearing stat label) reads better here than a hand, since
      // clicking shows information rather than performing an action.
      const overTeacher = [...this.teacherSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      this.game.canvas.style.cursor = overEnemy ? SWORD_CURSOR : overPodium ? FEATHER_CURSOR : overTeacher ? 'help' : '';
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

  // Bundles the things a fresh world-time broadcast drives — the shared
  // clock state, the cosmetic day/night tint, the Eat Brains button's
  // cooldown gray-out, and the top-right time label — since the first
  // three used to be one function (updateWorldHour) before this module
  // split.
  private handleWorldTime(hour: number, tick: number): void {
    setWorldTime(hour, tick);
    updateDaynightOverlay(hour);
    updateEatBrainsButton();
    updateWorldTimeLabel(hour);
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
    if (now - this.lastMoveAt < this.effectiveMoveCooldownMs()) return;

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
    this.updateOwnWeaponSprite(myProfile.equipment.weapon === 'bone dagger');
    this.updateOwnWandSprite(myProfile.equipment.weapon === WAND_ITEM);
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
  // A wand shares the dagger's own held-in-hand position (weaponOffsetFor)
  // rather than the shield/torch off-hand slot — the two are mutually
  // exclusive equipment-wise (see shared/equipment.ts's WAND_ITEM), so
  // there's never a conflict having them share positioning math.
  private updateOwnWandSprite(hasWand: boolean): void {
    this.playerWandSprite.setVisible(hasWand);
    this.repositionWeaponSprite(this.playerWandSprite, this.player, this.facing);
  }

  // The lucem glow (item 12) — redrawn fresh every call (same "just
  // recompute it, it's cheap" treatment drawHpBar already gets) rather
  // than tracking separate dirty state; visible only while a wand is
  // actually equipped AND lit. A soft two-layer circle (bright core, dim
  // halo) standing in for a real blur, positioned a bit further out than
  // the wand's own held position to approximate its tip.
  private updateOwnWandGlow(): void {
    const showGlow = Boolean(myProfile && myProfile.equipment.weapon === WAND_ITEM && myProfile.wandLit);
    this.playerWandGlow.setVisible(showGlow);
    if (!showGlow) return;
    const offset = this.weaponOffsetFor(this.facing);
    this.playerWandGlow.setPosition(this.player.x + offset.x * 1.6, this.player.y + offset.y * 1.6);
    this.playerWandGlow.clear();
    this.playerWandGlow.fillStyle(WAND_GLOW_COLOR, 0.35);
    this.playerWandGlow.fillCircle(0, 0, WAND_GLOW_RADIUS_PX * 2);
    this.playerWandGlow.fillStyle(WAND_GLOW_COLOR, 0.9);
    this.playerWandGlow.fillCircle(0, 0, WAND_GLOW_RADIUS_PX);
  }

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
      // A "settled down" seated pose (a follow-up ask: the previous
      // version's fast (900ms), large (18%) height-only squash read as
      // the character rapidly bobbing/jumping in place, not sitting).
      // Shorter AND a little wider as its static BASE pose — closer to
      // what a seated silhouette actually reads as than a pure vertical
      // squash — with only a small, slow breathing motion layered on top
      // (felt more than seen) instead of one big fast oscillation.
      const sitScaleY = baseScale * 0.8;
      const sitScaleX = baseScale * 1.08;
      sprite.setScale(sitScaleX, sitScaleY);
      this.tweens.add({
        targets: sprite,
        scaleY: sitScaleY * 0.97,
        duration: 2200,
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
    if (now - this.lastMoveAt < this.effectiveMoveCooldownMs()) return;

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
    if (now - this.lastApproachMoveAt < this.effectiveMoveCooldownMs()) return;
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
    this.repositionWeaponSprite(this.playerWandSprite, this.player, this.facing);
    this.updateOwnWandGlow();
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
    const wandSprite = sprite.getData('wandSprite') as Phaser.GameObjects.Sprite | undefined;
    if (wandSprite) this.repositionWeaponSprite(wandSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
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

  // Same shape as ensureWeaponSprite, for a wand instead — shares the
  // dagger's own hand position (mutually exclusive equipment-wise, see
  // shared/equipment.ts's WAND_ITEM). No glow for OTHER players' wands
  // yet (item 12 only asks for the LOCAL player's own — see
  // updateOwnWandGlow); a shared-visibility glow for allies would need
  // hasLight plumbed further than this batch's scope.
  private ensureWandSprite(sprite: Phaser.GameObjects.Sprite, hasWand: boolean, facing: Facing): void {
    let wandSprite = sprite.getData('wandSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!wandSprite) {
      wandSprite = this.add.sprite(sprite.x, sprite.y, WAND_TEXTURE_KEY).setDepth(1);
      sprite.setData('wandSprite', wandSprite);
    }
    sprite.setData('facing', facing);
    wandSprite.setVisible(hasWand);
    this.repositionWeaponSprite(wandSprite, sprite, facing);
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
    (sprite.getData('wandSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
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
    // Classrooms (a follow-up ask) are laid out at a third of the
    // standard room's tile footprint but still need to "fill up the
    // whole screen" — zooming in compensates for the smaller grid so the
    // effective on-screen coverage matches a full-size room at zoom 1.
    const zoom = (CLASSROOM_MAPS as readonly string[]).includes(this.currentMap) ? CLASSROOM_ZOOM : 1;
    cam.setZoom(zoom);
    cam.setBounds(0, 0, pixelWidth, pixelHeight);
    const fitsWidth = pixelWidth * zoom <= cam.width;
    const fitsHeight = pixelHeight * zoom <= cam.height;
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
    // show the first. Every exit uses the same fancy double door now (a
    // follow-up ask) — the old shop-vs-generic texture split is gone.
    for (const sprite of this.doorSprites) sprite.destroy();
    this.doorSprites = def.exits.map((exit) => {
      const pos = this.tilePosition(exit.row, exit.col);
      // Every reciprocal door pair lands you exactly on the tile that
      // triggers the return exit (see shared/maps.ts), so the player
      // stands ON a door sprite on every single transition. Without an
      // explicit depth, door sprites (recreated — and so re-inserted at
      // the top of the display list — on every renderMap call) rendered
      // OVER the player, hiding the sprite completely. Depth -0.5 keeps
      // them above the floor (-1) but below every character.
      if (exit.kind === 'stairs') return this.add.sprite(pos.x, pos.y, STAIRS_TEXTURE_KEY).setDepth(-0.5);
      return this.add.sprite(pos.x, pos.y, GRAND_DOOR_TEXTURE_KEY).setDepth(-0.5);
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
    for (const sprite of this.teacherSprites.values()) sprite.destroy();
    this.teacherSprites.clear();
    for (const sprite of this.teacherDeskSprites.values()) sprite.destroy();
    this.teacherDeskSprites.clear();

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

    // The moat ring + its bridge (a follow-up ask) — drawn as the outer
    // rectangle minus the inner one (see shared/maps.ts's isMoatBlocked,
    // which uses the exact same shape for collision), split into 4 bands
    // so the south one can leave a gap for the bridge rather than
    // drawing over it and then covering it back up.
    this.moatGraphics?.destroy();
    this.moatGraphics = null;
    this.bridgeGraphics?.destroy();
    this.bridgeGraphics = null;
    if (mapName === 'Grimoak Grounds') {
      const WATER = 0x2f6fa8;
      const fillTileBand = (
        graphics: Phaser.GameObjects.Graphics,
        rowStart: number,
        rowEnd: number,
        colStart: number,
        colEnd: number,
        color: number
      ) => {
        if (rowEnd < rowStart || colEnd < colStart) return;
        graphics.fillStyle(color, 1);
        graphics.fillRect(colStart * TILE_SIZE, rowStart * TILE_SIZE, (colEnd - colStart + 1) * TILE_SIZE, (rowEnd - rowStart + 1) * TILE_SIZE);
      };

      const moat = this.add.graphics().setDepth(-0.95);
      fillTileBand(moat, MOAT_OUTER_TOP, MOAT_INNER_TOP - 1, MOAT_OUTER_LEFT, MOAT_OUTER_RIGHT, WATER);
      fillTileBand(moat, MOAT_INNER_TOP, MOAT_INNER_BOTTOM, MOAT_OUTER_LEFT, MOAT_INNER_LEFT - 1, WATER);
      fillTileBand(moat, MOAT_INNER_TOP, MOAT_INNER_BOTTOM, MOAT_INNER_RIGHT + 1, MOAT_OUTER_RIGHT, WATER);
      fillTileBand(moat, MOAT_INNER_BOTTOM + 1, MOAT_OUTER_BOTTOM, MOAT_OUTER_LEFT, BRIDGE_COL_LEFT - 1, WATER);
      fillTileBand(moat, MOAT_INNER_BOTTOM + 1, MOAT_OUTER_BOTTOM, BRIDGE_COL_RIGHT + 1, MOAT_OUTER_RIGHT, WATER);
      this.moatGraphics = moat;

      const bridge = this.add.graphics().setDepth(-0.9);
      const PLANK = 0x8a6238;
      const PLANK_DARK = 0x5a3d24;
      fillTileBand(bridge, MOAT_INNER_BOTTOM, MOAT_OUTER_BOTTOM, BRIDGE_COL_LEFT, BRIDGE_COL_RIGHT, PLANK);
      for (let row = MOAT_INNER_BOTTOM; row <= MOAT_OUTER_BOTTOM; row++) {
        fillTileBand(bridge, row, row, BRIDGE_COL_LEFT, BRIDGE_COL_LEFT, PLANK_DARK);
        fillTileBand(bridge, row, row, BRIDGE_COL_RIGHT, BRIDGE_COL_RIGHT, PLANK_DARK);
      }
      this.bridgeGraphics = bridge;
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

        // A crow looping near the top of EVERY tower (a follow-up ask —
        // there are 4 towers now, not 2) — a small tween-driven wander
        // (not multi-frame animation) around a fixed anchor point near
        // each tower's spire. Anchor math uses the castle's SCALED
        // footprint, not its raw pixel size, and CASTLE_TOWER_X_FRACTIONS
        // (computed from the generator's own layout) so the crows stay
        // aligned with the towers regardless of the render scale.
        const scaledWidth = CASTLE_EXTERIOR_WIDTH * CASTLE_EXTERIOR_SCALE;
        const scaledHeight = CASTLE_EXTERIOR_HEIGHT * CASTLE_EXTERIOR_SCALE;
        const topY = pos.y - scaledHeight + scaledHeight * CASTLE_TOWER_TOP_FRACTION;
        for (const fraction of CASTLE_TOWER_X_FRACTIONS) {
          const anchorX = pos.x - scaledWidth / 2 + scaledWidth * fraction;
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

    // 4 fireplaces per castle interior room (2 top, 2 bottom — a
    // follow-up ask doubling the original top-only pair). Two stacked
    // sprites per fireplace now (a follow-up correction — the mantle
    // should stay perfectly still; only the fire itself sways/flickers):
    // a static stone mantle with NO tween at all, and a separate flame
    // layer on top that gets the sway + flicker.
    for (const sprite of this.fireplaceSprites) sprite.destroy();
    this.fireplaceSprites = [];
    // Half-sized in the small classrooms (a follow-up ask) — the large
    // rooms' own fireplaces stay full-size, just nudged toward the
    // center instead (see fireplacePositionsFor).
    const fireplaceScale = (CLASSROOM_MAPS as readonly string[]).includes(mapName) ? 0.5 : 1;
    for (const { row, col } of fireplacePositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const mantle = this.add.sprite(pos.x, pos.y, FIREPLACE_MANTLE_TEXTURE_KEY).setOrigin(0.5, 0.85).setScale(fireplaceScale).setDepth(-0.5);
      this.fireplaceSprites.push(mantle);

      const flame = this.add.sprite(pos.x, pos.y, FIREPLACE_FLAME_TEXTURE_KEY).setOrigin(0.5, 0.85).setScale(fireplaceScale).setDepth(-0.49);
      // A more natural, "flowing" flame (follow-up correction — a single
      // rigid rotation read as a mechanical pendulum swing, not fire) —
      // three independent tweens (sway, a taller/shorter "breathe," and a
      // narrower/wider squeeze) each on their OWN randomized, mutually
      // prime-ish duration, so their combined motion never repeats in an
      // obvious loop the way one tween alone would. A gentle alpha
      // flicker (matching the wall torches' own subtle one) rides
      // underneath for a little warmth. Every value randomized per
      // fireplace so no two flames move in lockstep.
      // Slower and wavier (a follow-up correction) — every duration
      // stretched out, plus a new lateral drift so the flame reads as
      // licking side to side, not just rocking in place.
      this.tweens.add({
        targets: flame,
        angle: { from: -5, to: 5 },
        duration: 620 + Math.random() * 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Scaled relative to fireplaceScale, not absolute — otherwise this
      // tween would override the classroom half-size setScale() above the
      // instant it started (Phaser tweens set the property outright, not
      // relative to whatever it already was).
      this.tweens.add({
        targets: flame,
        scaleY: { from: 0.9 * fireplaceScale, to: 1.1 * fireplaceScale },
        duration: 520 + Math.random() * 360,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: flame,
        scaleX: { from: 0.94 * fireplaceScale, to: 1.06 * fireplaceScale },
        duration: 760 + Math.random() * 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: flame,
        x: { from: pos.x - 2, to: pos.x + 2 },
        duration: 700 + Math.random() * 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: flame,
        alpha: { from: 0.85, to: 1 },
        duration: 550 + Math.random() * 350,
        yoyo: true,
        repeat: -1,
      });
      this.fireplaceSprites.push(flame);
    }

    // 4 student desks per classroom, 2 on either side (a follow-up ask) —
    // furniture only, no click handler.
    for (const sprite of this.studentDeskSprites) sprite.destroy();
    this.studentDeskSprites = [];
    for (const { row, col } of studentDeskPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const desk = this.add.sprite(pos.x, pos.y, CLASSROOM_DESK_TEXTURE_KEY).setOrigin(0.5, 0.85).setScale(0.55).setDepth(-0.5);
      this.studentDeskSprites.push(desk);
    }

    // A small social gathering spot's benches (a follow-up ask upgraded
    // these from plain chairs) — Entrance Hall and common-room-only,
    // furniture only, no click handler, collision is server-side (see
    // isBenchBlocked). Each one's own `angle` (see benchPositionsFor)
    // rotates it to face inward, toward the other three.
    for (const sprite of this.benchSprites) sprite.destroy();
    this.benchSprites = [];
    for (const { row, col, angle } of benchPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const bench = this.add.sprite(pos.x, pos.y, BENCH_TEXTURE_KEY).setOrigin(0.5, 0.85).setAngle(angle).setDepth(-0.5);
      this.benchSprites.push(bench);
    }

    // The classroom spellbook podiums (item 8, item 9's follow-up ask) —
    // clickable, roll a 10% chance of learning their own spell server-side;
    // reach-gated the same way a vendor/corpse is. Half-sized (item 5's
    // follow-up ask) — see renderSpellPodium's own setScale.
    this.spellbookPodiumSprite = this.renderSpellPodium(
      this.spellbookPodiumSprite,
      mapName,
      LUCEM_BOOK_MAP,
      LUCEM_BOOK_POSITION,
      () => this.network.readLucemBook()
    );
    this.irrigoPodiumSprite = this.renderSpellPodium(
      this.irrigoPodiumSprite,
      mapName,
      IRRIGO_BOOK_MAP,
      IRRIGO_BOOK_POSITION,
      () => this.network.readIrrigoBook()
    );
    // Utilization's second podium (a follow-up ask), teaching quick
    // movement — same mechanic, standing right next to the lucem one.
    this.celeritasPodiumSprite = this.renderSpellPodium(
      this.celeritasPodiumSprite,
      mapName,
      CELERITAS_BOOK_MAP,
      CELERITAS_BOOK_POSITION,
      () => this.network.readCeleritasBook()
    );
    // The Offense classroom's own podium (a later follow-up ask), teaching
    // augue.
    this.auguePodiumSprite = this.renderSpellPodium(
      this.auguePodiumSprite,
      mapName,
      AUGUE_BOOK_MAP,
      AUGUE_BOOK_POSITION,
      () => this.network.readAugueBook()
    );

    // A small floating label above each podium (a follow-up ask) —
    // hinting what it teaches without giving the exact spell name away.
    for (const sprite of this.podiumLabelSprites) sprite.destroy();
    this.podiumLabelSprites = [];
    const podiumLabels: Array<{ map: MapName; position: { row: number; col: number }; label: string }> = [
      { map: LUCEM_BOOK_MAP, position: LUCEM_BOOK_POSITION, label: LUCEM_BOOK_LABEL },
      { map: IRRIGO_BOOK_MAP, position: IRRIGO_BOOK_POSITION, label: IRRIGO_BOOK_LABEL },
      { map: CELERITAS_BOOK_MAP, position: CELERITAS_BOOK_POSITION, label: CELERITAS_BOOK_LABEL },
      { map: AUGUE_BOOK_MAP, position: AUGUE_BOOK_POSITION, label: AUGUE_BOOK_LABEL },
    ];
    for (const { map, position, label } of podiumLabels) {
      if (mapName !== map) continue;
      const pos = this.tilePosition(position.row, position.col);
      const text = this.add
        .text(pos.x, pos.y - 30, label, { fontSize: '8px', color: '#d8c888', fontStyle: 'italic' })
        .setOrigin(0.5, 1)
        .setDepth(-0.4);
      this.podiumLabelSprites.push(text);
    }
  }

  // Shared by both classroom podiums above — only their map/position/
  // read-action actually differ.
  private renderSpellPodium(
    existing: Phaser.GameObjects.Sprite | null,
    currentMapName: MapName,
    bookMap: MapName,
    position: { row: number; col: number },
    readAction: () => Promise<{ ok: boolean; message?: string; skills?: Record<string, number> }>
  ): Phaser.GameObjects.Sprite | null {
    existing?.destroy();
    if (currentMapName !== bookMap) return null;

    const pos = this.tilePosition(position.row, position.col);
    // No useHandCursor here — the podium gets its own custom feather
    // cursor instead (see the unified pointermove handler in create()),
    // which would otherwise fight with Phaser's own hover cursor.
    const podium = this.add.sprite(pos.x, pos.y, SPELLBOOK_PODIUM_TEXTURE_KEY).setOrigin(0.5, 0.85).setScale(0.5).setDepth(-0.5).setInteractive();
    podium.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (isInputCaptured() || !pointer.leftButtonDown()) return;
      if (!isWithinRadius(this.row, this.col, position.row, position.col, 1)) {
        logCombatMessage("You're too far away to reach the book.");
        return;
      }
      void readAction().then((ack) => {
        if (ack.message) logCombatMessage(ack.message);
        if (ack.ok && myProfile && ack.skills) {
          setMyProfile({ ...myProfile, skills: ack.skills });
          refreshOpenModals();
        }
      });
    });
    return podium;
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
    this.updateOwnWeaponSprite(player.equipment.weapon === 'bone dagger');
    this.updateOwnWandSprite(player.equipment.weapon === WAND_ITEM);
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
      this.ensureWeaponSprite(sprite, p.equipment.weapon === 'bone dagger', (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureWandSprite(sprite, p.equipment.weapon === WAND_ITEM, (sprite.getData('facing') as Facing) ?? 'down');
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

    // Classroom teachers — static and permanent for the lifetime of the
    // map, same "create once" shape as vendors above. Clickable now (a
    // follow-up ask) — a hand cursor and a fading world-space tooltip
    // greeting, nothing mechanical yet.
    for (const t of state.teachers) {
      if (this.teacherSprites.has(t.id)) continue;

      const deskPos = this.tilePosition(t.row + 1, t.col);
      const deskSprite = this.add.sprite(deskPos.x, deskPos.y, CLASSROOM_DESK_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5);
      this.teacherDeskSprites.set(t.id, deskSprite);

      const pos = this.tilePosition(t.row, t.col);
      // No useHandCursor here — same reasoning as the spellbook podiums'
      // own "No useHandCursor here" comment above: the unified pointermove
      // handler in create() owns the cursor for every non-default hover
      // case (sword/feather/help) now, and fighting Phaser's own hover
      // cursor here is what silently broke it before (see that handler's
      // own comment).
      const sprite = this.add.sprite(pos.x, pos.y, textureKeyFor('teacher'), idleFrameFor('teacher', 'down')).setScale(CHAR_SCALE).setInteractive();
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        // A fixed, generic line (a later follow-up ask dropped the
        // earlier per-classroom "<Subject>. Please study from the
        // podium." framing entirely, now that Utilization's classroom has
        // TWO podiums — "podiums" plural reads correctly everywhere).
        this.showTeacherTooltip(sprite, 'Please study from the podiums.');
      });
      this.teacherSprites.set(t.id, sprite);
    }
  }

  // A world-space speech-bubble tooltip (item 8's follow-up ask, made to
  // linger a couple of seconds longer by a later follow-up) — plain
  // Phaser text with a background, held fully visible for a couple of
  // seconds, THEN fading out over 3 more, then destroyed. Positioned just
  // above whoever it's for.
  private showTeacherTooltip(anchor: Phaser.GameObjects.Sprite, message: string): void {
    const bubble = this.add
      .text(anchor.x, anchor.y - 46, message, {
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: '#1a1a2ee6',
        padding: { x: 8, y: 6 },
        wordWrap: { width: 180 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(5);
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      delay: 2000,
      duration: 3000,
      onComplete: () => bubble.destroy(),
    });
  }

  // True either because the player can see everywhere themselves
  // (infravision — strictly better than a torch, which only lights a
  // small radius, see localLightRadiusTiles below) or because the map itself is
  // always lit regardless of who's standing in it (the torch-lined
  // Labyrinth). Matches shared/lighting.ts's hasFullVision for the
  // infravision half of this.
  private hasFullVision(): boolean {
    if (isAlwaysLit(this.currentMap)) return true;
    return myProfile ? myProfile.skills[INFRAVISION_SKILL] !== undefined : false;
  }

  // The radius (in tiles) of whichever LOCAL light source currently
  // reaches the player — their own carried torch, a nearby ally's carried
  // torch (a torch is the only thing that actually emits light others can
  // share in — see shared/lighting.ts's emitsLight), or a static fixture
  // (a town lamp's small LIGHT_RADIUS_TILES, or the castle's much bigger
  // CASTLE_LIGHT_RADIUS_TILES) — or null if none reach at all.
  private localLightRadiusTiles(): number | null {
    if (!myProfile) return null;
    // Takes the BEST (largest) of every light source currently reaching
    // the player, not just the first one checked (a follow-up bug fix —
    // early-returning whichever a static source like the castle's own
    // gave, even while it was fading toward the edge of its range, meant
    // an active lucem was silently ignored the whole time the player was
    // anywhere near a static source at all, including well past the
    // castle's own light — lucem should always guarantee its own radius
    // regardless of what else is or isn't nearby).
    let best: number | null = null;
    const staticRadius = staticLightRadiusAt(this.currentMap, this.row, this.col);
    if (staticRadius !== null) best = staticRadius;
    if (myProfile.equipment.shield === TORCH_ITEM) best = best === null ? LIGHT_RADIUS_TILES : Math.max(best, LIGHT_RADIUS_TILES);
    if (myProfile.wandLit) best = best === null ? LUCEM_LIGHT_RADIUS_TILES : Math.max(best, LUCEM_LIGHT_RADIUS_TILES);
    for (const sprite of this.otherPlayers.values()) {
      if (!sprite.getData('hasLight')) continue;
      const otherRow = sprite.getData('row') as number;
      const otherCol = sprite.getData('col') as number;
      if (isWithinLightRadius(this.row, this.col, otherRow, otherCol)) best = best === null ? LIGHT_RADIUS_TILES : Math.max(best, LIGHT_RADIUS_TILES);
    }
    return best;
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
    // Floored at NO_LIGHT_RADIUS_TILES no matter what — a source with a
    // gradual falloff (the castle's, see staticLightRadiusAt) can compute
    // an effective radius smaller than that floor as the player nears the
    // very edge of its range, which without this Math.max left a dead
    // zone darker than having NO light source at all (a bug: the player
    // always has at least their own small personal-vision radius, unless/
    // until some future "no light at all" mechanic is added on purpose).
    const radiusTiles = Math.max(this.localLightRadiusTiles() ?? NO_LIGHT_RADIUS_TILES, NO_LIGHT_RADIUS_TILES);
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
          duration: this.effectiveMoveCooldownMs(),
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
    // Clicking anywhere in the game world deselects whatever inventory
    // item was targeted for drink/pour/irrigo (item 10's follow-up ask,
    // "selecting anywhere else") — the same "clicking elsewhere clears
    // the old selection" precedent the player/monster target below
    // already follows for itself.
    this.clearItemTarget();
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

  // A wholly separate targeting concept from targetKind/targetId above —
  // "which inventory item is currently aimed at" for drink/pour/irrigo
  // (item 11's follow-up ask). Tracked by NAME rather than array index —
  // the inventory is a flat array that reshuffles indices whenever
  // anything else is added/removed/consumed, so an index captured at
  // click time could silently point at the wrong item by cast time; a
  // canteen is also the only one of anything a player ever carries, so
  // name alone is unambiguous. Set by inventoryEquipment.ts's click
  // handler on a fillable item.
  private targetItemName: string | null = null;

  setItemTarget(item: string): void {
    this.targetItemName = item;
    logCombatMessage(`Targeted: ${item}.`);
  }

  clearItemTarget(): void {
    if (this.targetItemName === null) return;
    this.targetItemName = null;
    // Clears the Inventory modal's own "targeted" highlight immediately,
    // wherever this got called from (closing the modal, clicking
    // elsewhere in the game world, ...) rather than leaving it stale
    // until the next unrelated re-render.
    refreshOpenModals();
  }

  getItemTarget(): string | null {
    return this.targetItemName;
  }

  // Drink/pour/irrigo all resolve the targeted item's CURRENT index fresh
  // (see targetItemName's own doc comment) and apply the same shape of
  // ack back onto myProfile. Irrigo's own message is ALSO toasted (a
  // later follow-up ask: "messages... even if a modal like inventory is
  // open") since casting it is most likely to happen with the Inventory
  // modal open (that's how its target gets picked in the first place),
  // where the plain combat-log line would be hidden behind the modal.
  private useItemTargetedSkill(skillName: string): void {
    if (!myProfile || !this.targetItemName) {
      logCombatMessage('Select an item in your inventory first.');
      return;
    }
    const itemIndex = myProfile.inventory.indexOf(this.targetItemName);
    if (itemIndex === -1) {
      logCombatMessage("You don't have that anymore.");
      this.clearItemTarget();
      return;
    }
    const action =
      skillName === DRINK_SKILL
        ? this.network.drinkItem(itemIndex)
        : skillName === POUR_SKILL
          ? this.network.pourItem(itemIndex)
          : this.network.castIrrigo(itemIndex);
    void action.then((ack) => {
      if (ack.message) {
        logCombatMessage(ack.message);
        if (skillName === IRRIGO_SKILL) showCenterToast(ack.message);
      }
      if (!ack.ok || !myProfile) return;
      setMyProfile({
        ...myProfile,
        canteenDrinks: ack.canteenDrinks ?? myProfile.canteenDrinks,
        mana: ack.mana ?? myProfile.mana,
        skills: ack.skills ?? myProfile.skills,
      });
      this.updateOwnBars();
      refreshOpenModals();
    });
  }

  // Quick movement's own ~10% move-speed boost (a follow-up ask) — the
  // server is the actual authority on whether the spell is active
  // (myProfile.celeritasActive, kept in sync via 'sync'); this just
  // shortens the client-side key-repeat throttle/slide-tween duration
  // that already governs how fast movement FEELS, same value used for
  // both (see the constant's own MOVE_COOLDOWN_MS doc comment).
  private effectiveMoveCooldownMs(): number {
    return myProfile?.celeritasActive ? Math.round(MOVE_COOLDOWN_MS * 0.9) : MOVE_COOLDOWN_MS;
  }

  // Lucem/celeritas's own ack-based cast (a later follow-up ask,
  // replacing the old fire-and-forget '/lucem' chat command) — always
  // toasts the result on top of the normal combat-log line, same reason
  // as irrigo above: casting from the action bar with a modal open
  // shouldn't leave the outcome invisible.
  private castToggleSpell(cast: () => Promise<{ ok: boolean; mana?: number; skills?: Record<string, number>; message?: string }>): void {
    void cast().then((ack) => {
      if (ack.message) showCenterToast(ack.message);
      if (!ack.ok || !myProfile) return;
      setMyProfile({
        ...myProfile,
        mana: ack.mana ?? myProfile.mana,
        skills: ack.skills ?? myProfile.skills,
      });
      this.updateOwnBars();
      refreshOpenModals();
    });
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
    // Lucem/celeritas are no-target toggles too (item 11: "the
    // player would simply click on it to either create light on the wand
    // or to remove light") — ack-based (a later follow-up ask) rather
    // than driving a chat command, so the result can be toasted even
    // with a modal open.
    if (skillName === LUCEM_SKILL) {
      this.castToggleSpell(() => this.network.castLucem());
      return;
    }
    if (skillName === CELERITAS_SKILL) {
      this.castToggleSpell(() => this.network.castCeleritas());
      return;
    }
    // Drink/pour/irrigo (items 7, 8 & 11's follow-up asks) act on a
    // targeted INVENTORY item, not a player/npc/monster — a wholly
    // separate targeting concept (see setItemTarget, driven by clicking a
    // fillable item in the Inventory modal) from targetKind/targetId
    // below.
    if (skillName === DRINK_SKILL || skillName === POUR_SKILL || skillName === IRRIGO_SKILL) {
      this.useItemTargetedSkill(skillName);
      return;
    }

    if (!this.targetKind || !this.targetId) {
      logCombatMessage('Select a target first (left-click a player or monster).');
      return;
    }
    // Augue (a later follow-up ask) is a RANGED spell (up to 7 tiles, see
    // game.gateway.ts's AUGUE_RANGE_TILES) — unlike every skill below,
    // which is melee and walks the player into contact range first (see
    // tryEngage), this resolves immediately server-side with no walking
    // involved. The actual hit result (damage, hp bar, log line) arrives
    // through the ordinary 'combat' broadcast (see applyCombatEvent),
    // same as any other attack — this only needs to surface a pre-flight
    // rejection (not learned/on cooldown/out of range) that only the
    // caster would otherwise see.
    if (skillName === AUGUE_SKILL) {
      void this.network.castAugue({ targetKind: this.targetKind, targetId: this.targetId }).then((ack) => {
        if (!ack.ok && ack.message) showCenterToast(ack.message);
      });
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
