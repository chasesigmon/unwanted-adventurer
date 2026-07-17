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
  GATE_ROW,
  NORTH_GATE_ROW,
  GATE_COL_LEFT,
  GATE_COL_RIGHT,
  GATE_REACH_TILES,
  CASTLE_DOOR_ON_GROUNDS,
  GRIMOAK_GROUNDS_ROAD_ROWS,
  GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES,
  CAVERNA_SECRET_DOOR_POSITION,
  CAVERNA_CHEST_POSITION,
  BRAMWICK_MID_COL,
  BRAMWICK_ENTRANCE_ROW,
} from '../../shared/maps.js';
import { treePositionsFor } from '../../shared/trees.js';
import {
  PUNCH_SKILL,
  DAGGER_SKILL,
  INFRAVISION_SKILL,
  LIGHT_SKILL,
  WATERFILL_SKILL,
  HASTE_SKILL,
  ARCANE_BOLT_SKILL,
  WAND_BOLT_SKILL,
  UNLOCK_SKILL,
  STUN_SKILL,
  DISARM_SKILL,
  AEGIS_SKILL,
  STONE_WALL_SKILL,
  ANIMATE_DEAD_SKILL,
  RECALL_SKILL,
  BARRIER_SKILL,
  BARRIER_RADIUS_TILES,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  FIRE_BOLT_SKILL,
  WATER_BOLT_SKILL,
  AIR_BOLT_SKILL,
  EARTH_BOLT_SKILL,
  LESSER_HEAL_SKILL,
  LESSER_SELF_HEAL_SKILL,
  WISP_TRANSFORMATION_SKILL,
  WISP_MOVE_COOLDOWN_FACTOR,
  KINETIC_STRIKE_SKILL,
  SAP_HEALTH_SKILL,
  MONSTER_SUMMONS_SKILL,
  DEMON_IMP_KIND,
  SUMMON_DEMON_IMP_SKILL,
  INVISIBILITY_SKILL,
  CREATE_DUPLICATE_SKILL,
  SPELL_ATTACK_RANGE_TILES,
  DRINK_SKILL,
  POUR_SKILL,
  FLIGHT_SKILL,
  FLIGHT_MOVE_COOLDOWN_FACTOR,
} from '../../shared/skills.js';
import { PVP_MIN_LEVEL, isPvpAllowedMap } from '../../shared/pvp.js';
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
  bedPositionsFor,
  BED_REACH_TILES,
  isNearBench,
  greatHallTableFootprint,
  greatHallChairPositionsFor,
  greatHallStagePlatform,
  portalPositionsFor,
  BRAMWICK_SIGN_POSITION,
  GRIMOAK_GROUNDS_SIGN_POSITION,
  standingTorchPositionsFor,
} from '../../shared/lighting.js';
import {
  MONSTER_KINDS,
  FLORO_SHOP_MAPS,
  BRAMWICK_SHOP_MAPS,
  GRIMOAK_CASTLE_MAPS,
  CLASSROOM_MAPS,
  COMMON_ROOM_MAPS,
  DORM_MAPS,
  SPECIALIZATION_CHAMBER_MAPS,
} from '../../shared/constants.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { WAND_ITEM, isWandItem } from '../../shared/equipment.js';
import { questIconStateFor, activeQuestIdFor } from '../../shared/quests.js';
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
  LockTarget,
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
  CLASSROOM_SYMBOL_TEXTURE_KEYS,
  BENCH_TEXTURE_KEY,
  FIREBALL_TEXTURE_KEY,
  BOLT_TEXTURE_KEY,
  ARCANE_BOLT_TEXTURE_KEY,
  WATER_BOLT_TEXTURE_KEY,
  AIR_BOLT_TEXTURE_KEY,
  EARTH_BOLT_TEXTURE_KEY,
  WISP_TEXTURE_KEY,
  WISP_FRAME_SIZE,
  WISP_ANIM_KEY,
  CHEST_LOCKED_TEXTURE_KEY,
  CHEST_UNLOCKED_TEXTURE_KEY,
  STONE_BLOCK_TEXTURE_KEY,
  BED_TEXTURE_KEY,
  LONG_TABLE_TEXTURE_KEY,
  CASTLE_GATE_LEAF_TEXTURE_KEY,
  CASTLE_GATE_LEAF_WIDTH_PX,
  HALL_CHAIR_TEXTURE_KEY,
  HEAD_CHAIR_TEXTURE_KEY,
  GREAT_HALL_STAGE_TEXTURE_KEY,
  PORTAL_TEXTURE_KEY,
  FLIGHT_CLOUD_TEXTURE_KEY,
  FLIGHT_CLOUD_FEET_OFFSET_Y,
  SIGN_TEXTURE_KEY,
  DIRT_ROAD_TEXTURE_KEY,
  STANDING_TORCH_TEXTURE_KEY,
  STANDING_TORCH_FRAME_WIDTH,
  STANDING_TORCH_FRAME_HEIGHT,
  STANDING_TORCH_UNLIT_FRAME,
  STANDING_TORCH_LIT_FRAME,
  QUEST_ICON_TEXTURE_KEY,
  QUEST_ICON_FRAME_WIDTH,
  QUEST_ICON_FRAME_HEIGHT,
  QUEST_ICON_NOT_STARTED_FRAME,
  QUEST_ICON_READY_FRAME,
  QUEST_ICON_IN_PROGRESS_FRAME,
  PET_TEXTURE_KEYS,
  PET_FRAME_WIDTH,
  PET_FRAME_HEIGHT,
  CLASSROOM_ZOOM,
  COMMON_ROOM_ZOOM,
  DORM_ZOOM,
  CORPSE_SCALE,
  CROW_TEXTURE_KEY,
  DAGGER_TEXTURE_KEY,
  CLUB_TEXTURE_KEY,
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
  BRAMWICK_COTTAGE_TEXTURE_KEY,
  BRAMWICK_COTTAGE_FRAME_WIDTH,
  BRAMWICK_COTTAGE_FRAME_HEIGHT,
  SWORD_CURSOR,
  KEY_CURSOR,
  SLEEP_CURSOR,
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
import { logChatMessage, logCombatMessage, noteCombatActivity } from '../ui/log.js';
import { showCenterToast } from '../ui/toast.js';
import { loadActionBarOnce } from '../ui/actionBar.js';
import { closeAllModals, isInputCaptured, isMovementBlocked, refreshOpenModals, updateMapButtonVisibility } from '../ui/modalCore.js';
import { refreshCharSheetIfOpen } from '../ui/charSheet.js';
import { openCorpseModal, stackedItemsLabel, updateEatBrainsButton } from '../ui/corpseModal.js';
import { openPetCorpseModal } from '../ui/petCorpseModal.js';
import { openChestModal } from '../ui/chestModal.js';
import { openBedModal } from '../ui/bedModal.js';
import { openBenchModal } from '../ui/benchModal.js';
import { openShopModal } from '../ui/shopModal.js';
import { openTargetInfoModal } from '../ui/targetInfoModal.js';
import { notifyMapChanged } from '../ui/mapModal.js';
import { openNpcDialogueModal, openSpecializationDialogue, openHouseChoiceDialogue, openTeacherLearnDialogue } from '../ui/npcDialogueModal.js';
import { hideTargetPanel, updateTargetPanel, updateLockTargetPanel } from '../ui/targetPanel.js';
import { updateGroupPanel } from '../ui/groupPanel.js';
import type { PetSnapshot, AnimatedMonsterSnapshot } from '../../shared/pets.js';
import { openRecallModal } from '../ui/recallModal.js';
import { openMonsterSummonsModal } from '../ui/monsterSummonsModal.js';

const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;

// A rare monster's own distinguishing tint (a later follow-up ask: the
// scale bump alone read as "a slightly bigger imp," easy to miss) — a
// warm gold, applied once at sprite creation since a rare's own sprite is
// never destroyed/recreated for the life of the map (maxCount: 1, no
// class of monster besides these 3 ever toggles isRare on/off).
const RARE_MONSTER_TINT = 0xffd166;

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
  // Scutum's blue-ish shield sphere (a later follow-up ask) — one per
  // player currently showing it (keyed by username, 'self' for the local
  // player), visible to everyone nearby, not just the caster (see
  // updateScutumGlow).
  private scutumGlows = new Map<string, Phaser.GameObjects.Graphics>();
  // Barrier's own fixed-position dome (a later follow-up ask) — unlike
  // scutum's sphere (which just follows whichever sprite has it active),
  // the dome is anchored to the exact tile it was cast on (see
  // handleCastBarrier's own barrierOrigin) since the player can move
  // around inside it but never past its edge. Local-player-only for this
  // first pass — see updateBarrierVisual's own doc comment.
  private barrierDomeOrigin: { row: number; col: number } | null = null;
  private barrierDomeGraphics: Phaser.GameObjects.Graphics | null = null;
  // Wisp transformation's own shimmering-orb overlay (a later follow-up
  // ask) — one per player currently transformed (keyed by username,
  // 'self' for the local player), visible to everyone nearby. Unlike
  // scutum's glow (an ADDITIONAL effect layered on top of the normal
  // character sprite), this REPLACES it — see updateWispVisual, which
  // hides the underlying character sprite while its own wisp sprite is
  // shown.
  private wispSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Flight's own ground-hugging cloud (a later follow-up ask) — unlike
  // wisp's sprite-replacing shape, this is an ADDITIONAL effect layered
  // under the normal character sprite (same "layered on top/under, not a
  // replacement" shape as updateScutumGlow), keyed the same way.
  private flightCloudSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprites: Phaser.GameObjects.Sprite[] = [];
  // Classroom door symbols (a follow-up ask) — recreated alongside
  // doorSprites in renderDoorsAndChest, same lifetime.
  private classroomSymbolSprites: Phaser.GameObjects.Sprite[] = [];
  // The secret room's treasure chest (a later follow-up ask) — only
  // populated on 'Caverna Secretissima', clickable to open it (see
  // renderMap and handleChestClick).
  private chestSprite: Phaser.GameObjects.Sprite | null = null;
  // Which lockable object (the secret door or its chest) the player has
  // most recently clicked — resera targets THIS, not the usual combat
  // targetKind/targetId, since doors/chests aren't combat targets. Reset
  // to null on every map change.
  private lockTarget: LockTarget | null = null;
  // Murus lapideus (a later follow-up ask) — true right after the spell
  // is clicked in the action bar, consumed by the very next left-click
  // anywhere on the map (see handleLeftClick).
  private murusLapideusTargeting = false;
  // A corpse "target" (a later follow-up ask replaced animate dead's own
  // arm-then-click flow with this: "a corpse is selectable... and then
  // they use the animate dead spell") — same top-left panel a door/
  // chest's own lockTarget selection uses (no hp bar to show), mutually
  // exclusive with every other selection concept in the scene. Set by
  // left-clicking a corpse sprite (see applyMapState); read by
  // useTargetedSkill's own ANIMATE_DEAD_SKILL branch.
  private selectedCorpseId: string | null = null;
  // A selected stone block (a later follow-up ask: "so the player can see
  // the health and name 'Blockman'") — same "not a real combat target"
  // reasoning as lockTarget above, purely for the top-left display panel.
  private selectedStoneBlockId: string | null = null;
  // A selected pet (a later follow-up ask: "make it so other players
  // pets are selectable... double clicked... to see more details") —
  // same "not a real combat target, purely informational" reasoning as
  // every other selection concept above; works for any pet, not just
  // other players' (the owner's own pet already has full management via
  // the group panel, but there's no reason world-clicking it shouldn't
  // also work the same way).
  private selectedPetId: string | null = null;
  // The decorative shop building standing behind each of Floro's shop
  // doors (item 13) — only populated while rendering the 'Floro' map
  // itself (the shop interiors don't need their own exterior rendered).
  private shopBuildingSprites: Phaser.GameObjects.Sprite[] = [];
  // Bramwick's own 4 shop cottages (a later follow-up ask) — same "one
  // building sprite behind each shop door" idea as Floro's above, only
  // populated while rendering 'Bramwick' itself.
  private cottageSprites: Phaser.GameObjects.Sprite[] = [];
  // Bramwick's own 9 standing torches (a later follow-up ask) — frame
  // toggled between unlit/lit on every 'worldTime' broadcast (see
  // handleWorldTime), not per-frame in update(), since the hour only
  // ever changes once per world-clock tick.
  private standingTorchSprites: Phaser.GameObjects.Sprite[] = [];
  // A visible warm glow around each LIT standing torch (a follow-up bug
  // fix: "the torches aren't actually providing a light source" — the
  // mechanical darkFog radius push-back near a static light source, see
  // shared/lighting.ts's staticLightRadiusAt, is subtle enough on its own
  // that it doesn't read as "this torch is glowing" the way a player's
  // own carried lucem light does; this makes it directly visible,
  // matching lucem's own two-circle soft/bright glow shape, sized to the
  // SAME functional radius torches actually light (LUCEM_LIGHT_RADIUS_TILES).
  private standingTorchGlows: Phaser.GameObjects.Graphics[] = [];
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
  // The Grounds' own stretch of road up to Bramwick's entrance (a later
  // follow-up ask) — a TileSprite overlay, same "on top of the base
  // floor" technique as the moat/bridge above, only populated on
  // 'Grimoak Grounds'.
  private roadTile: Phaser.GameObjects.TileSprite | null = null;
  // The castle gate at the bridge's own outer end (a later follow-up
  // ask) — two leaf sprites (the right one just the same texture
  // flipped) that slide apart when open, only populated on 'Grimoak
  // Grounds'. `gateOpen` tracks the last-applied state purely so
  // updateGateState doesn't restart the slide tween every single
  // map:state tick when nothing's actually changed.
  private gateLeftSprite: Phaser.GameObjects.Sprite | null = null;
  private gateRightSprite: Phaser.GameObjects.Sprite | null = null;
  private gateOpen = false;
  // The moat's own second, NORTH crossing (a later follow-up ask: "the
  // same bridge and gate mechanism going north") — a straight shot up to
  // Bramwick's entrance instead of detouring around the moat's east/west
  // side. Same shape as the south gate's own 3 fields above, just its own
  // independent open/closed state (see updateGateState).
  private northGateLeftSprite: Phaser.GameObjects.Sprite | null = null;
  private northGateRightSprite: Phaser.GameObjects.Sprite | null = null;
  private northGateOpen = false;
  private fireplaceSprites: Phaser.GameObjects.Sprite[] = [];
  // 4 student desks per classroom (a follow-up ask) — reuses the same
  // desk texture the teacher's own desk uses (see teacherDeskSprites),
  // just placed at studentDeskPositionsFor's fixed positions instead.
  private studentDeskSprites: Phaser.GameObjects.Sprite[] = [];
  // A social gathering spot's benches (a follow-up ask upgraded these
  // from plain chairs) — Entrance Hall and common-room-only, see
  // shared/lighting.ts's benchPositionsFor.
  private benchSprites: Phaser.GameObjects.Sprite[] = [];
  // The Dorms rooms' own 5 beds (a later follow-up ask) — clickable, see
  // bedPositionsFor.
  private bedSprites: Phaser.GameObjects.Sprite[] = [];
  // The Great Hall's own banquet table, dining/stage chairs, and faculty
  // stage platform (a later follow-up ask) — furniture only, no click
  // handler, collision is server-side (see isGreatHallTableBlocked/
  // isGreatHallChairBlocked). Table and stage are single sprites scaled
  // to their own server-side footprint; chairs are individually placed
  // and rotated per greatHallChairPositionsFor's own `angle`.
  private greatHallTableSprite: Phaser.GameObjects.Sprite | null = null;
  private greatHallStageSprite: Phaser.GameObjects.Sprite | null = null;
  // The castle's 4th floor own 4 decorative portals (a later follow-up
  // ask) — furniture only, no click handler yet ("mechanics... come
  // later"), collision is server-side (see isPortalBlocked).
  private portalSprites: Phaser.GameObjects.Sprite[] = [];
  // The two road signs flanking Bramwick's own dirt-road entrance (a
  // later follow-up ask put one on each side, see BRAMWICK_SIGN_POSITION/
  // GRIMOAK_GROUNDS_SIGN_POSITION) — array now instead of a single
  // sprite, since up to one can exist per map and both need destroying/
  // recreating together on every renderMap.
  private signSprites: Phaser.GameObjects.Sprite[] = [];
  private greatHallChairSprites: Phaser.GameObjects.Sprite[] = [];
  private race: Race = 'goblin';
  // Human-only appearance (item 4) — see displayKind/effectiveSpriteKind.
  private gender: Gender | null = null;
  private hairColor: HairColor | null = null;
  private skinTone: SkinTone | null = null;
  // A slime's mimicked appearance — overrides race for texture/animation
  // lookups ONLY (see displayKind); race itself is always the true,
  // mechanical one. A later follow-up ask removed the /mimic and /revert
  // commands entirely, so this can never be set to non-null anymore —
  // kept only so displayKind/effectiveSpriteKind's fallback stays total.
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
  // A player's own companion pet (a later follow-up ask) — keyed by pet
  // id, same lifetime/cleanup shape as monsterSprites above.
  private petSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // A later follow-up ask: "the corpses of pets should be selectable"
  // — same seen-set create/update/cleanup shape as every other transient
  // entity here.
  private petCorpseSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private animatedMonsterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // The local player's own current pet/animated monsters (a later follow-
  // up ask's 'z' hotkey needs to know "do I have a follower at all" at
  // keypress time, not just at render time) — refreshed alongside
  // updateGroupPanel every applyMapState, same source of truth.
  private myPet: PetSnapshot | null = null;
  private myAnimatedMonsters: AnimatedMonsterSnapshot[] = [];
  // Murus lapideus's own summoned stone blocks (a later follow-up ask) —
  // rendered with an hp bar like an NPC/monster, but not player-clickable
  // (not asked for).
  private stoneBlockSprites = new Map<string, Phaser.GameObjects.Sprite>();
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
  // A quest-giver's own floating status icon (a later follow-up ask) —
  // one per teacher WITH questIds, keyed the same as teacherSprites so
  // it destroys/rebuilds alongside it; refreshed (frame/visibility) via
  // updateTeacherQuestIcons whenever myProfile.quests can have changed
  // (accepting/completing a quest, a level-up, or any other full 'sync').
  private teacherQuestIconSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Left-click target (see setTarget/handleLeftClick) — id is a username
  // for a player, otherwise the npc/monster's own id. Cleared whenever
  // the target dies/leaves/disconnects (see applyMapState's cleanup
  // loops).
  private targetKind: 'player' | 'npc' | 'monster' | null = null;
  private targetId: string | null = null;
  // Set when a right-click/action-bar skill use targets something too far
  // to hit yet — each move-cooldown tick walks one step closer (see
  // runApproachTick), then automatically engages once adjacent.
  // A follow-up ask generalized this beyond melee: `range` undefined means
  // the original strict-adjacency melee case (tryEngage); a real number
  // means a ranged spell/attack (augue, wand bolt, stupefaciunt, exarme)
  // walking into ITS OWN range instead. `onInRange` is whatever action
  // should actually fire once close enough — melee's own attack dispatch
  // for the adjacency case, or a ranged cast's network call otherwise.
  private approach: { kind: 'player' | 'npc' | 'monster'; id: string; range?: number; onInRange: () => void } | null = null;
  private lastApproachMoveAt = 0;
  // Whether the player's own default attack (punch/dagger/wand bolt) is
  // currently engaged/walking-to-engage — lets the 'x' hotkey act as a
  // real toggle (a later follow-up ask) instead of only ever stopping.
  private autoAttacking = false;
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
    // Bramwick's own dirt-road street (a later follow-up ask).
    this.load.svg('dirt', '/dirt-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    // Grimoak Grounds' own stretch of road leading up to it (a later
    // follow-up ask: "clearly have a different colored dirt road from
    // the dirt in Bramwick") — a cooler, grayer worn-path tone, its own
    // asset rather than a tint, so it reads as visibly distinct even
    // side by side at the shared entrance tile.
    this.load.svg(DIRT_ROAD_TEXTURE_KEY, '/dirt-road-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    // Bramwick's own 9 freestanding street torches (a later follow-up
    // ask) — 2 frames (unlit by day / lit at night), generated via
    // Python/PIL same as the cottage spritesheet above.
    this.load.spritesheet(STANDING_TORCH_TEXTURE_KEY, '/standing-torch-spritesheet.png', {
      frameWidth: STANDING_TORCH_FRAME_WIDTH,
      frameHeight: STANDING_TORCH_FRAME_HEIGHT,
    });
    // Quest status icons over a quest-giver's own head (a later follow-up
    // ask) — 3 frames, see shared/quests.ts's QuestIconState.
    this.load.spritesheet(QUEST_ICON_TEXTURE_KEY, '/quest-icon-spritesheet.png', {
      frameWidth: QUEST_ICON_FRAME_WIDTH,
      frameHeight: QUEST_ICON_FRAME_HEIGHT,
    });
    // Companion pets (a later follow-up ask) — one small 2-frame
    // spritesheet per kind.
    for (const [kind, key] of Object.entries(PET_TEXTURE_KEYS)) {
      this.load.spritesheet(key, `/pet-${kind}-spritesheet.png`, {
        frameWidth: PET_FRAME_WIDTH,
        frameHeight: PET_FRAME_HEIGHT,
      });
    }
    this.load.svg(TREE_TEXTURE_KEY, '/tree.svg', { width: 48, height: 64 });
    this.load.svg(DAGGER_TEXTURE_KEY, '/dagger.svg', { width: 16, height: 16 });
    this.load.svg(CLUB_TEXTURE_KEY, '/club.svg', { width: 16, height: 16 });
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
    // Bramwick's own 4 shop cottages (a later follow-up ask) — one frame
    // per shop, each with its own baked-in name sign, in BRAMWICK_SHOP_MAPS
    // order (see tools' own generator, run via Python/PIL — no Aseprite/
    // pixel-mcp available in this environment either).
    this.load.spritesheet(BRAMWICK_COTTAGE_TEXTURE_KEY, '/bramwick-cottage-spritesheet.png', {
      frameWidth: BRAMWICK_COTTAGE_FRAME_WIDTH,
      frameHeight: BRAMWICK_COTTAGE_FRAME_HEIGHT,
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
    // Classroom door symbols (a follow-up ask) — one small icon per
    // classroom, loaded once here regardless of map (cheap, tiny SVGs)
    // rather than per-renderMap.
    for (const key of Object.values(CLASSROOM_SYMBOL_TEXTURE_KEYS)) {
      this.load.svg(key, `/${key}.svg`, { width: 20, height: 20 });
    }
    this.load.image(BENCH_TEXTURE_KEY, '/bench.png');
    this.load.image(FIREBALL_TEXTURE_KEY, '/fireball.png');
    this.load.image(BOLT_TEXTURE_KEY, '/bolt.png');
    this.load.image(ARCANE_BOLT_TEXTURE_KEY, '/arcane-bolt.png');
    this.load.image(WATER_BOLT_TEXTURE_KEY, '/water-bolt.png');
    this.load.image(AIR_BOLT_TEXTURE_KEY, '/air-bolt.png');
    this.load.image(EARTH_BOLT_TEXTURE_KEY, '/earth-bolt.png');
    this.load.spritesheet(WISP_TEXTURE_KEY, '/wisp.png', { frameWidth: WISP_FRAME_SIZE, frameHeight: WISP_FRAME_SIZE });
    this.load.image(CHEST_LOCKED_TEXTURE_KEY, '/chest-locked.png');
    this.load.image(CHEST_UNLOCKED_TEXTURE_KEY, '/chest-unlocked.png');
    this.load.image(STONE_BLOCK_TEXTURE_KEY, '/stone-block.png');
    this.load.image(LONG_TABLE_TEXTURE_KEY, '/long-table.png');
    this.load.image(CASTLE_GATE_LEAF_TEXTURE_KEY, '/castle-gate-leaf.png');
    this.load.image(HALL_CHAIR_TEXTURE_KEY, '/hall-chair.png');
    this.load.image(HEAD_CHAIR_TEXTURE_KEY, '/head-chair.png');
    this.load.image(GREAT_HALL_STAGE_TEXTURE_KEY, '/great-hall-stage.png');
    this.load.image(BED_TEXTURE_KEY, '/bed.png');
    this.load.image(PORTAL_TEXTURE_KEY, '/portal.png');
    this.load.image(FLIGHT_CLOUD_TEXTURE_KEY, '/flight-cloud.png');
    this.load.image(SIGN_TEXTURE_KEY, '/sign.png');
    createWallTorchTexture(this);
    preloadCharacterSprites(this);
  }

  create(): void {
    createCharacterAnims(this);
    defineBodyPartFrames(this);
    // Wisp transformation's own shimmering-orb loop (a later follow-up
    // ask) — a slow, continuous animation cycling all 6 frames, never
    // stopping while active (see updateWispVisual).
    if (!this.anims.exists(WISP_ANIM_KEY)) {
      this.anims.create({
        key: WISP_ANIM_KEY,
        frames: this.anims.generateFrameNumbers(WISP_TEXTURE_KEY, { start: 0, end: 5 }),
        frameRate: 6,
        repeat: -1,
      });
    }

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
    // A sword cursor over an enemy — monsters, plus the training
    // skeletons specifically (a follow-up ask: "indicate combat is
    // possible"), not other players or the friendly training dummy.
    // Neither monster nor NPC sprites are `setInteractive` themselves
    // (see findTargetableAt's own bounds-based hit-testing), hence the
    // manual check here.
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isInputCaptured()) {
        this.game.canvas.style.cursor = '';
        return;
      }
      // A later follow-up ask: "if a player hovers their mouse over
      // another player that meets the level restriction, is not in their
      // group, and they are not in Grimoak Castle then the mouse should
      // become a sword" — same eligibility rules as canAttackPlayer
      // server-side (see shared/pvp.ts), computed here purely for the
      // cursor hint; the server re-validates for real at engage time
      // regardless.
      const overAttackablePlayer = [...this.otherPlayers.entries()].some(
        ([username, s]) =>
          s.getBounds().contains(pointer.worldX, pointer.worldY) &&
          (myProfile?.level ?? 0) >= PVP_MIN_LEVEL &&
          ((s.getData('level') as number | undefined) ?? 0) >= PVP_MIN_LEVEL &&
          isPvpAllowedMap(this.currentMap) &&
          !(myProfile?.party ?? []).includes(username)
      );
      const overEnemy =
        overAttackablePlayer ||
        [...this.monsterSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        [...this.npcSprites.values()].some(
          (s) => s.getData('label') === 'training skeleton' && s.getBounds().contains(pointer.worldX, pointer.worldY)
        );
      // A teacher's own `useHandCursor` (set on their sprite below) never
      // actually showed — this SAME pointermove handler fires on every
      // mouse move and unconditionally reset the cursor back to '' right
      // after Phaser's own pointerover set it to 'pointer' (a follow-up
      // bug fix: "make it tooltip cursor" turned out to require teaching
      // THIS handler about teachers too, not the sprite itself). A 'help'
      // cursor (a "?" — see appendStatRow's own use of the same cursor for
      // a tooltip-bearing stat label) reads better here than a hand, since
      // clicking shows information rather than performing an action.
      const hoveredTeacher = [...this.teacherSprites.values()].find((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      const overTeacher = Boolean(hoveredTeacher);
      // A follow-up ask's quest-giver teacher (the Headmistress) uses a
      // plain pointer cursor instead of the ordinary classroom teacher's
      // 'help' — clicking her actually DOES something (opens her dialogue
      // and offers a quest), it isn't just an info tooltip.
      const overQuestGiverTeacher =
        ((hoveredTeacher?.getData('questIds') as string[] | undefined)?.length ?? 0) > 0 ||
        Boolean(hoveredTeacher?.getData('specializationGate')) ||
        Boolean(hoveredTeacher?.getData('houseChoiceGate')) ||
        ((hoveredTeacher?.getData('teachesSkills') as string[] | undefined)?.length ?? 0) > 0;
      // A key cursor over any door or the treasure chest (a follow-up
      // ask) — every door is resera-targetable now, not just the secret
      // one (see the doorSprites click handler below).
      const overLockable =
        this.doorSprites.some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        Boolean(this.chestSprite?.getBounds().contains(pointer.worldX, pointer.worldY));
      const overBed = this.bedSprites.some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      // A follow-up ask: "the portals... should have a pointer" on hover
      // — same reasoning as teachers/vendors above, this handler
      // overwrites Phaser's own `useHandCursor`/pointerover cursor on
      // every mouse move, so it has to be taught about portals directly
      // rather than relying on setInteractive's own cursor option.
      const overPortal =
        this.portalSprites.some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY)) ||
        this.signSprites.some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      // A follow-up bug fix: "when the cursor hovers over the Great Hall
      // shopkeeper, make it a pointer" — vendors and corpses use
      // `useHandCursor` on their own sprites, but that never actually
      // showed either, for the exact same reason teachers' own
      // useHandCursor didn't (see the comment above) — this handler fires
      // on every mouse move and unconditionally overwrote the cursor
      // Phaser's own pointerover had just set. Both need to be taught to
      // this handler too, same as teachers were.
      const overVendor = [...this.vendorSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      const overCorpse = [...this.corpseSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      // A follow-up ask: "on hover make the cursor a pointer" for benches
      // — a plain pointer, not the bed's own SLEEP_CURSOR, since resting
      // on a bench (unlike sleeping) doesn't black out the screen.
      const overBench = this.benchSprites.some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      this.game.canvas.style.cursor = overEnemy
        ? SWORD_CURSOR
        : overLockable
          ? KEY_CURSOR
          : overBed
            ? SLEEP_CURSOR
            : overQuestGiverTeacher
                ? 'pointer'
                : overTeacher
                  ? 'help'
                  : overVendor || overCorpse || overBench || overPortal
                    ? 'pointer'
                    : '';
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
    // A later follow-up ask ("show a message when the monster hits
    // anything that concerns the player... including the stone") — a
    // private, visible-combat-log-only notice (see net.ts/shared/
    // types.ts's combatNotice), used for things that don't fit the
    // ordinary player-vs-target 'combat' broadcast shape.
    this.network.addEventListener('combatNotice', ((e: CustomEvent<string>) => logCombatMessage(e.detail)) as EventListener);
    // A later follow-up ask: "when the follower goes and attacks a
    // target the player should begin to auto attack or auto move toward
    // the monster... similar to right clicking" — private-to-this-owner
    // signal (see shared/types.ts's own doc comment) fired the instant
    // the follower's contact starts a brand new server-side combat
    // session, i.e. only ever when the player wasn't already fighting
    // anything, so this never interrupts an existing fight.
    this.network.addEventListener(
      'followerEngaged',
      ((e: CustomEvent<{ targetKind: 'monster' | 'player'; targetId: string }>) =>
        this.handleFollowerEngaged(e.detail.targetKind, e.detail.targetId)) as EventListener
    );
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
    // Bramwick's own standing torches (a later follow-up ask: "not lit
    // during the day but become lit at night") — the hour only changes
    // once per world-clock tick, so this is cheaper than checking every
    // update() frame; a no-op array on every map but Bramwick.
    const lit = isDarkHour(hour);
    const frame = lit ? STANDING_TORCH_LIT_FRAME : STANDING_TORCH_UNLIT_FRAME;
    for (const sprite of this.standingTorchSprites) sprite.setFrame(frame);
    for (const glow of this.standingTorchGlows) glow.setVisible(lit);
  }

  update(): void {
    this.repositionHpBars();
    this.updateDarkFog();
    applyDaynightTint(isAlwaysLit(this.currentMap), myProfile ? myProfile.skills[INFRAVISION_SKILL] !== undefined : false);

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
    this.updateOwnWandSprite(isWandItem(myProfile.equipment.weapon));
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
    const showGlow = Boolean(myProfile && isWandItem(myProfile.equipment.weapon) && myProfile.wandLit);
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
  // sprite art). Resting/sitting and dancing are genuine looping
  // animations instead (a gentle "settling down" squash for resting, a
  // lively side-to-side swing for dancing — see the /dance follow-up
  // ask) — no dedicated pose art for either, so both are built from
  // tweens over the ordinary idle frame. Only ONE pose can be active at
  // once (dancing forces the player awake server-side — see
  // handleDanceCommand), so this takes a single combined `pose` value
  // rather than juggling restState and dancing as two independent tween
  // systems that could otherwise stomp on each other's angle/scale via
  // the same killTweensOf call. Only re-applied when the pose actually
  // changes (tracked via getData) so repeated map:state/sync ticks for
  // an unchanged pose don't restart the tween from scratch.
  private applyPose(sprite: Phaser.GameObjects.Sprite, pose: RestState | 'dancing', baseScale: number): void {
    if (sprite.getData('pose') === pose) return;
    sprite.setData('pose', pose);
    this.tweens.killTweensOf(sprite);
    sprite.setAngle(0);
    sprite.setScale(baseScale);

    if (pose === 'sleeping') {
      sprite.setAngle(90);
    } else if (pose === 'resting') {
      // A "settled down" seated pose (a follow-up ask: the previous
      // version's fast (900ms), large (18%) height-only squash read as
      // the character rapidly bobbing/jumping in place, not sitting).
      // Shorter AND a little wider as its static BASE pose — closer to
      // what a seated silhouette actually reads as than a pure vertical
      // squash. Purely static once settled (a later follow-up ask: the
      // small looping "breathing" tween this used to have on top was
      // still a visible wobble — the shrink itself is the whole pose now,
      // no motion layered on top of it).
      const sitScaleY = baseScale * 0.8;
      const sitScaleX = baseScale * 1.08;
      sprite.setScale(sitScaleX, sitScaleY);
    } else if (pose === 'dancing') {
      // A snappy side-to-side swing (unlike resting's slow settle) —
      // "bust a move" reads better fast — layered with a small bouncy
      // vertical pulse so it doesn't look like a pure rigid pendulum.
      this.tweens.add({ targets: sprite, angle: 16, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: sprite, scaleY: baseScale * 1.12, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

    // A later follow-up bug fix: "the imp did not start moving toward
    // the player when the player attacked" — tell the server right away
    // so the monster starts chasing back while the player is still
    // walking over, instead of only learning about this fight once
    // contact is finally made.
    if (kind === 'monster') this.network.engageMelee({ targetKind: kind, targetId: id });
    this.approach = { kind, id, onInRange: () => this.tryEngage(kind, id, skill) };
  }

  // A follow-up ask: "if the player clicks to use a spell on a monster...
  // and they are too far away, then begin moving them into range" — same
  // approach/runApproachTick machinery as tryEngage's melee case above,
  // just checked against a real Chebyshev radius (matching the server's
  // own isWithinRadius) instead of strict cardinal adjacency. Used by
  // every ranged cast (augue, wand bolt's right-click auto-attack,
  // stupefaciunt, exarme).
  private tryRangedAction(kind: 'player' | 'npc' | 'monster', id: string, range: number, perform: () => void): void {
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
    if (Math.max(Math.abs(dRow), Math.abs(dCol)) <= range) {
      this.approach = null;
      perform();
      return;
    }
    this.approach = { kind, id, range, onInRange: perform };
  }

  private runApproachTick(): void {
    if (!this.approach) return;
    const now = Date.now();
    if (now - this.lastApproachMoveAt < this.effectiveMoveCooldownMs()) return;
    if (this.isMoving || this.isPunching) return;

    const { kind, id, range, onInRange } = this.approach;
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

    const inRange = range === undefined ? Math.abs(dRow) + Math.abs(dCol) === 1 : Math.max(Math.abs(dRow), Math.abs(dCol)) <= range;
    if (inRange) {
      this.approach = null;
      onInRange();
      return;
    }

    this.lastApproachMoveAt = now;
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
    this.updateScutumGlow('self', this.player, Boolean(myProfile?.scutumActive));
    this.updateBarrierVisual();
    this.updateWispVisual('self', this.player, Boolean(myProfile?.wispActive));
    this.updateFlightVisual('self', this.player, Boolean(myProfile?.flightActive));
    // Invisibility (a later follow-up ask) — "make the player's sprite
    // slightly faded while the spell is active," for the CASTER'S OWN
    // view of themselves only; other players don't even get a faded
    // sprite, they get NO sprite at all (see applyMapState).
    this.player.setAlpha(myProfile?.invisibleActive ? 0.4 : 1);
    for (const [username, sprite] of this.otherPlayers) {
      this.repositionBarFor(sprite);
      this.updateScutumGlow(username, sprite, Boolean(sprite.getData('scutumActive')));
      this.updateWispVisual(username, sprite, Boolean(sprite.getData('wispActive')));
      this.updateFlightVisual(username, sprite, Boolean(sprite.getData('flightActive')));
    }
    for (const sprite of this.npcSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.monsterSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.stoneBlockSprites.values()) this.repositionBarFor(sprite);
    // A follow-up ask: "show the hp bar of the pet/summon/animated" —
    // same floating world-space bar every other combatant already gets,
    // just never wired up for these two before now.
    for (const sprite of this.petSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.animatedMonsterSprites.values()) this.repositionBarFor(sprite);
  }

  // Scutum's blue-ish shield sphere (a later follow-up ask) — visible to
  // every nearby player, not just the caster (scutumActive is part of
  // PlayerSnapshot for exactly this reason), same "redraw fresh every
  // call" treatment as the lucem wand-glow above. Keyed by username ('self'
  // for the local player) so each player's own sphere tracks their own
  // sprite independently.
  private updateScutumGlow(key: string, sprite: Phaser.GameObjects.Sprite, active: boolean): void {
    let glow = this.scutumGlows.get(key);
    if (!active) {
      glow?.setVisible(false);
      return;
    }
    if (!glow) {
      glow = this.add.graphics().setDepth(0.9);
      this.scutumGlows.set(key, glow);
    }
    glow.setVisible(true);
    glow.setPosition(sprite.x, sprite.y);
    glow.clear();
    glow.lineStyle(2, 0x4aa8ff, 0.85);
    glow.strokeCircle(0, 0, 22);
    glow.fillStyle(0x4aa8ff, 0.12);
    glow.fillCircle(0, 0, 22);
  }

  // Wisp transformation's own shimmering orb (a later follow-up ask) —
  // unlike scutum's glow (layered ON TOP of the normal character
  // sprite), this REPLACES it entirely: the underlying character sprite
  // is hidden while the wisp sprite is shown in its place, and restored
  // the moment the transformation ends. Keyed by username ('self' for
  // the local player), same as updateScutumGlow. First-pass scope
  // decision: equipped-gear overlay sprites (weapon/wand/shield/torch)
  // aren't separately hidden here — a minor cosmetic gap (a floating
  // weapon icon can still peek out), not a mechanical one, since combat
  // is already blocked entirely while transformed.
  private updateWispVisual(key: string, sprite: Phaser.GameObjects.Sprite, active: boolean): void {
    let wisp = this.wispSprites.get(key);
    if (!active) {
      wisp?.setVisible(false);
      sprite.setVisible(true);
      return;
    }
    sprite.setVisible(false);
    if (!wisp) {
      wisp = this.add.sprite(sprite.x, sprite.y, WISP_TEXTURE_KEY).setDepth(sprite.depth);
      wisp.play(WISP_ANIM_KEY);
      this.wispSprites.set(key, wisp);
    }
    wisp.setVisible(true);
    wisp.setPosition(sprite.x, sprite.y);
  }

  // Flight's own ground-hugging cloud (a later follow-up ask: "put a
  // small cloudy looking sphere under the character's feet that moves
  // with the character... swirling like the portals"). Unlike wisp's
  // sprite-REPLACING shape, this sits UNDER the ordinary character sprite
  // (lower depth) and never hides it — the player still looks like
  // themselves, just floating over a wisp of cloud. Keyed the same way
  // updateWispVisual/updateScutumGlow are (username, or 'self').
  private updateFlightVisual(key: string, sprite: Phaser.GameObjects.Sprite, active: boolean): void {
    let cloud = this.flightCloudSprites.get(key);
    if (!active) {
      cloud?.setVisible(false);
      return;
    }
    if (!cloud) {
      cloud = this.add.sprite(sprite.x, sprite.y, FLIGHT_CLOUD_TEXTURE_KEY).setDepth(sprite.depth - 0.01).setAlpha(0.85);
      this.tweens.add({ targets: cloud, angle: 360, duration: 4000, repeat: -1, ease: 'Linear' });
      this.flightCloudSprites.set(key, cloud);
    }
    cloud.setVisible(true);
    cloud.setPosition(sprite.x, sprite.y + FLIGHT_CLOUD_FEET_OFFSET_Y);
  }

  // Barrier's own yellow dome (a later follow-up ask) — deliberately
  // local-player-only for this first pass (a bystander doesn't need to
  // see another player's exact dome extent; only monster-avoidance and
  // this player's own movement-confinement are ever checked against it).
  // Drawn fixed at barrierDomeOrigin, not following the player's own
  // sprite, since the whole point is a zone the player can move around
  // inside but never past.
  private updateBarrierVisual(): void {
    if (!myProfile?.barrierActive || !this.barrierDomeOrigin) {
      this.barrierDomeGraphics?.setVisible(false);
      return;
    }
    if (!this.barrierDomeGraphics) {
      this.barrierDomeGraphics = this.add.graphics().setDepth(0.9);
    }
    const pos = this.tilePosition(this.barrierDomeOrigin.row, this.barrierDomeOrigin.col);
    const baseRadiusPx = (BARRIER_RADIUS_TILES + 0.5) * TILE_SIZE;
    // A slow, gentle pulse (a follow-up ask: "create the animation sprite
    // for the barrier") — the dome itself is a vector shape (its exact
    // radius has to match BARRIER_RADIUS_TILES precisely for the
    // collision boundary to look correct), so the "animation" is this
    // breathing radius/alpha cycle rather than a baked sprite sheet.
    const pulse = Math.sin(this.time.now / 500) * 0.03;
    const radiusPx = baseRadiusPx * (1 + pulse);
    const alpha = 0.85 + pulse * 2;
    this.barrierDomeGraphics.setVisible(true);
    this.barrierDomeGraphics.setPosition(pos.x, pos.y);
    this.barrierDomeGraphics.clear();
    this.barrierDomeGraphics.lineStyle(3, 0xe8d84a, alpha);
    this.barrierDomeGraphics.strokeCircle(0, 0, radiusPx);
    this.barrierDomeGraphics.fillStyle(0xe8d84a, 0.1);
    this.barrierDomeGraphics.fillCircle(0, 0, radiusPx);
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
  // until the next sync/combat event. ALSO refreshes the plain-DOM status
  // bar's own HP/MP text now (a follow-up bug report: "the HP/MP in the
  // player bar at the top left sometimes seem slow to update") — the
  // mirror-image gap of the one this comment already describes: several
  // mana-spending actions (lucem/celeritas/irrigo, ...) called this method
  // but never updateStatusBar() directly, so the graphical bar above the
  // player updated instantly while the top-left text sat stale until
  // some LATER unrelated event happened to touch it. Folding both into
  // one call means neither can be forgotten independently again.
  updateOwnBars(): void {
    if (!myProfile) return;
    drawHpBar(this.playerHpBar, myProfile.hp, myProfile.maxHp);
    drawStatBar(this.playerManaBar, myProfile.maxMana > 0 ? myProfile.mana / myProfile.maxMana : 0, MANA_BAR_COLOR);
    updateStatusBar();
  }

  // A quest-giver's own floating status icon (a later follow-up ask) —
  // re-derives each teacher's current state fresh from myProfile.quests
  // every call rather than trying to track deltas, same "just recompute
  // it" approach updateOwnBars above already uses. Called once right
  // after teachers are created (applyMapState) and again anywhere
  // myProfile.quests can have changed (applySync, and after a quest
  // accept/complete — see npcDialogueModal.ts).
  updateTeacherQuestIcons(): void {
    for (const iconSprite of this.teacherQuestIconSprites.values()) {
      const questIds = iconSprite.getData('questIds') as string[] | undefined;
      const questId = activeQuestIdFor(questIds, myProfile?.quests ?? {});
      if (!questId) continue;
      const state = myProfile
        ? questIconStateFor(questId, myProfile.quests ?? {}, myProfile.skills, myProfile.inventory, {
            mapUnlocked: myProfile.mapUnlocked,
            houseChosen: Boolean(myProfile.house),
          })
        : 'not-started';
      if (state === null) {
        iconSprite.setVisible(false);
        continue;
      }
      iconSprite.setVisible(true);
      iconSprite.setFrame(
        state === 'not-started' ? QUEST_ICON_NOT_STARTED_FRAME : state === 'ready' ? QUEST_ICON_READY_FRAME : QUEST_ICON_IN_PROGRESS_FRAME
      );
    }
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
  // The item is always in the character's own RIGHT hand — which is why
  // 'up' and 'down' can't share the same sign: facing 'down' looks at the
  // camera (mirrored, so their right hand renders on screen-LEFT),
  // facing 'up' shows their back (not mirrored, so their right hand
  // renders on screen-RIGHT), same as a person turning 180° in place. A
  // follow-up bug fix previously made 'up' match 'down's sign for a
  // simpler "positive x always screen-right" rule, which fixed 'up' but
  // was wrong for the opposite reason 'down' is being fixed now ("the
  // wand should be in the right hand while facing south... it appears in
  // the left hand" — screen-right while facing the camera IS the
  // character's left hand).
  private weaponOffsetFor(facing: Facing): { x: number; y: number } {
    switch (facing) {
      case 'down':
        return { x: -10, y: 6 };
      case 'up':
        return { x: 10, y: -8 };
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
  // textureKey defaults to the dagger (every existing call site's own
  // weapon) — the training skeletons' wooden club (a follow-up ask) is
  // the one exception, passing CLUB_TEXTURE_KEY explicitly. setTexture
  // every call (cheap, a no-op if unchanged) rather than only at creation
  // since the same overlay sprite could in principle hold either item
  // over an NPC's lifetime.
  private ensureWeaponSprite(sprite: Phaser.GameObjects.Sprite, hasWeapon: boolean, facing: Facing, textureKey: string = DAGGER_TEXTURE_KEY): void {
    let weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!weaponSprite) {
      weaponSprite = this.add.sprite(sprite.x, sprite.y, textureKey).setDepth(1);
      sprite.setData('weaponSprite', weaponSprite);
    } else {
      weaponSprite.setTexture(textureKey);
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
    // Same reasoning as the map-decoration destroy loops in renderMap
    // (fireplaces/torches/crows/trees) — a resting or dancing other-
    // player/monster can be mid pose tween (see applyPose) when they
    // leave the map, and destroying the sprite without stopping that
    // tween first risks the same "tween throws on a destroyed target,
    // freezing all tween processing" crash a follow-up bug report traced
    // fireplaces/movement freezing to.
    this.tweens.killTweensOf(sprite);
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

  // The inverse of tilePosition — which tile a world-space click landed
  // on (murus lapideus's own "click a spot on the map" targeting).
  private tileAt(worldX: number, worldY: number): { row: number; col: number } {
    return { row: Math.floor(worldY / TILE_SIZE), col: Math.floor(worldX / TILE_SIZE) };
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

    if (prevRow === row && prevCol === col) return;

    const dRow = row - prevRow;
    const dCol = col - prevCol;
    const facing: Facing = Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'up' : 'down') : dCol < 0 ? 'left' : 'right';
    sprite.setData('facing', facing);
    const pos = this.tilePosition(row, col);

    // A later follow-up bug fix: "imps still are not moving toward the
    // player... their sprite stays in the same place while getting
    // attacked" — a monster's own counter-attack swing (see
    // playMonsterCounterAnim) sets isPunching on the SAME combat tick
    // this position update arrives (both are driven by the same ~3s
    // tick), so this used to skip the tween ENTIRELY whenever isPunching
    // was set, which is every single tick of an ongoing fight — freezing
    // the sprite in place for as long as combat continued even though
    // its real row/col kept advancing server-side. The position tween
    // must always run; only the walk ANIMATION (which would visually
    // fight the punch swing) skips while mid-swing.
    // Flight (a later follow-up ask: "the player sprite is not walking,
    // but instead floating/flying along") — a bystander watching another
    // flying player needs to see the same thing: hold the idle frame
    // instead of playing the walk cycle, same as attemptMove does for the
    // local player's own sprite (see effectiveMoveCooldownMs's own
    // FLIGHT_MOVE_COOLDOWN_FACTOR doc comment).
    const flying = Boolean(sprite.getData('flightActive'));
    if (!sprite.getData('isPunching')) {
      if (flying) sprite.setTexture(textureKeyFor(kind), idleFrameFor(kind, facing));
      else sprite.play(walkAnimKey(kind, facing), true);
    }
    this.tweens.add({
      targets: sprite,
      x: pos.x,
      y: pos.y,
      duration: REMOTE_STEP_TWEEN_MS,
      onComplete: () => {
        if (sprite.getData('isPunching')) return; // let the swing animation keep playing/finish on its own
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
    // The secret room shares the classrooms' own exact footprint (see
    // shared/maps.ts's CAVERNA_SECRETISSIMA), so it gets the same
    // treatment even though it isn't itself a CLASSROOM_MAPS entry. Dorms
    // and common rooms/Great Hall (a later follow-up ask: "make each
    // dorm... fullscreen, just like how the classrooms are") get their
    // own zoom factors instead, computed for their own (different)
    // footprints — see mapRender.ts's COMMON_ROOM_ZOOM/DORM_ZOOM.
    // 'Specialization' (formerly Elemental Casting Classroom, a later
    // follow-up ask) shares the same classroom footprint too, despite no
    // longer being a CLASSROOM_MAPS entry — same "not a classroom
    // anymore, still classroom-sized" carve-out Caverna Secretissima
    // already gets.
    const isClassroomSized =
      (CLASSROOM_MAPS as readonly string[]).includes(this.currentMap) ||
      this.currentMap === 'Caverna Secretissima' ||
      this.currentMap === 'Specialization' ||
      // The 10 specialization chambers (a later follow-up ask) — same
      // classroom footprint (CLASSROOM_ROWS/COLS), same "not a
      // CLASSROOM_MAPS entry so it gets no student desks" carve-out.
      (SPECIALIZATION_CHAMBER_MAPS as readonly string[]).includes(this.currentMap);
    const isCommonRoomSized = (COMMON_ROOM_MAPS as readonly string[]).includes(this.currentMap) || this.currentMap === 'Great Hall';
    const isDormSized = (DORM_MAPS as readonly string[]).includes(this.currentMap);
    const zoom = isClassroomSized ? CLASSROOM_ZOOM : isCommonRoomSized ? COMMON_ROOM_ZOOM : isDormSized ? DORM_ZOOM : 1;
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

    // A lock target/Blockman selection from the PREVIOUS map never
    // applies here.
    if (this.lockTarget) this.clearLockTarget();
    if (this.selectedStoneBlockId) this.clearBlockmanTarget();

    // Doors + the secret room's own treasure chest (item 4's follow-up
    // fix: "the teacher and desk disappeared" when resera re-rendered
    // this map) — pulled into its OWN small method, called here on a real
    // map transition AND standalone after a resera cast, so refreshing
    // the chest's locked/unlocked texture never wipes/re-requests every
    // other transient sprite (teacher, npc, monster, vendor, corpse,
    // other players) the way calling this whole renderMap did.
    this.renderDoorsAndChest(mapName);

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

    // Bramwick's own 4 shop cottages (a later follow-up ask) — same
    // "one building behind each door" idea as Floro's above. Every
    // Bramwick shop door faces north (see shared/maps.ts's
    // bramwickShopDoorExits), so there's no left/right mirroring to pick
    // — just the one frame per shop, keyed off BRAMWICK_SHOP_MAPS' own
    // order to match tools' generator.
    for (const sprite of this.cottageSprites) sprite.destroy();
    this.cottageSprites =
      mapName === 'Bramwick'
        ? def.exits
            .filter((exit) => (BRAMWICK_SHOP_MAPS as readonly string[]).includes(exit.toMap))
            .map((exit) => {
              // Anchored at the exit tile's own SOUTH edge (half a tile
              // below tilePosition's center) rather than one tile north
              // of it — the cottage's own baked-in door art touches the
              // sprite's bottom edge (see tools' own generator), so this
              // puts that door right on the real MapExit tile itself (a
              // later follow-up ask, no separate door sprite anymore).
              const pos = this.tilePosition(exit.row, exit.col);
              const frame = (BRAMWICK_SHOP_MAPS as readonly string[]).indexOf(exit.toMap);
              return this.add
                .sprite(pos.x, pos.y + TILE_SIZE / 2, BRAMWICK_COTTAGE_TEXTURE_KEY, frame)
                .setOrigin(0.5, 1)
                .setDepth(-0.75);
            })
        : [];

    // Bramwick's own 9 standing street torches (a later follow-up ask) —
    // starts on whichever frame the current hour already calls for (not
    // always unlit) so a transition into Bramwick at night doesn't show
    // every torch unlit for a moment until the next 'worldTime' tick.
    for (const sprite of this.standingTorchSprites) sprite.destroy();
    for (const glow of this.standingTorchGlows) glow.destroy();
    const standingTorchLit = worldTimeKnown && isDarkHour(currentWorldHour);
    // Matches the actual functional radius (see shared/lighting.ts's own
    // STATIC_LIGHT_SOURCES entry for Bramwick, LUCEM_LIGHT_RADIUS_TILES + 3
    // now — "expand the distance of the light radius offered").
    const standingTorchGlowRadiusPx = (LUCEM_LIGHT_RADIUS_TILES + 3) * TILE_SIZE;
    this.standingTorchSprites = [];
    this.standingTorchGlows = [];
    for (const { row, col } of standingTorchPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const frame = standingTorchLit ? STANDING_TORCH_LIT_FRAME : STANDING_TORCH_UNLIT_FRAME;
      this.standingTorchSprites.push(this.add.sprite(pos.x, pos.y, STANDING_TORCH_TEXTURE_KEY, frame).setOrigin(0.5, 1).setDepth(-0.5));
      const glow = this.add.graphics().setDepth(-0.6).setVisible(standingTorchLit);
      glow.setPosition(pos.x, pos.y - TILE_SIZE / 2);
      glow.fillStyle(WAND_GLOW_COLOR, 0.12);
      glow.fillCircle(0, 0, standingTorchGlowRadiusPx);
      glow.fillStyle(WAND_GLOW_COLOR, 0.3);
      glow.fillCircle(0, 0, standingTorchGlowRadiusPx * 0.4);
      this.standingTorchGlows.push(glow);
    }

    // Other entities belong to whichever map we just left — clear them
    // out immediately rather than waiting for the next map:state.
    for (const sprite of this.otherPlayers.values()) this.destroyEntitySprite(sprite);
    this.otherPlayers.clear();
    for (const glow of this.scutumGlows.values()) glow.destroy();
    this.scutumGlows.clear();
    for (const sprite of this.wispSprites.values()) sprite.destroy();
    this.wispSprites.clear();
    for (const sprite of this.flightCloudSprites.values()) sprite.destroy();
    this.flightCloudSprites.clear();
    for (const sprite of this.npcSprites.values()) this.destroyEntitySprite(sprite);
    this.npcSprites.clear();
    for (const sprite of this.monsterSprites.values()) this.destroyEntitySprite(sprite);
    this.monsterSprites.clear();
    for (const sprite of this.petSprites.values()) this.destroyEntitySprite(sprite);
    this.petSprites.clear();
    for (const sprite of this.petCorpseSprites.values()) sprite.destroy();
    this.petCorpseSprites.clear();
    for (const sprite of this.animatedMonsterSprites.values()) this.destroyEntitySprite(sprite);
    this.animatedMonsterSprites.clear();
    for (const sprite of this.stoneBlockSprites.values()) this.destroyEntitySprite(sprite);
    this.stoneBlockSprites.clear();
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
    for (const sprite of this.teacherQuestIconSprites.values()) sprite.destroy();
    this.teacherQuestIconSprites.clear();

    // Great-Plains-only, fixed positions from the shared/trees.ts seed —
    // the server blocks movement onto these same tiles (see
    // WorldManagerService/MonsterManagerService), so this list must stay
    // byte-for-byte identical between client and server.
    // Kills each sway/flicker/breathe tween BEFORE destroying its target
    // (a follow-up bug fix: "went outside and wandered around and came
    // back in... the screen froze including fireplaces and player
    // movement"). Without this, a tween left running against an already-
    // destroyed sprite (re-entering a map re-creates all of these, but
    // never explicitly stopped the PREVIOUS visit's tweens) eventually
    // throws when it tries to update a property on the destroyed
    // GameObject — an uncaught error inside Phaser's tween step halts
    // ALL tween processing for the rest of the session, not just that one
    // tween, which is why fireplaces elsewhere on the map froze too and
    // why the in-flight move tween that sets isMoving never reached its
    // onComplete to clear the flag again, permanently blocking movement.
    this.tweens.killTweensOf(this.treeSprites);
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
    this.tweens.killTweensOf(this.wallTorchSprites);
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
    this.gateLeftSprite?.destroy();
    this.gateLeftSprite = null;
    this.gateRightSprite?.destroy();
    this.gateRightSprite = null;
    this.gateOpen = false;
    this.northGateLeftSprite?.destroy();
    this.northGateLeftSprite = null;
    this.northGateRightSprite?.destroy();
    this.northGateRightSprite = null;
    this.northGateOpen = false;
    this.roadTile?.destroy();
    this.roadTile = null;
    if (mapName === 'Bramwick') {
      // A later follow-up bug fix: "the dirt road to exit Bramwick is
      // still the same color as the rest of the town" — the reddish
      // dirt-road patch below already existed on the Grimoak Grounds side
      // of this same border (see the other branch of this if/else just
      // below), but nothing mirrored it on Bramwick's own side, so the
      // short stretch leading up to the exit still showed Bramwick's
      // plain flat 'dirt' floor texture. Same width/depth/texture as the
      // Grounds patch, just anchored to Bramwick's south entrance instead
      // of the castle door.
      const roadWidthTiles = GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES * 2 + 1;
      this.roadTile = this.add
        .tileSprite(
          (BRAMWICK_MID_COL - GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES) * TILE_SIZE,
          (BRAMWICK_ENTRANCE_ROW - GRIMOAK_GROUNDS_ROAD_ROWS + 1) * TILE_SIZE,
          roadWidthTiles * TILE_SIZE,
          GRIMOAK_GROUNDS_ROAD_ROWS * TILE_SIZE,
          DIRT_ROAD_TEXTURE_KEY
        )
        .setOrigin(0, 0)
        .setDepth(-0.99);
    } else if (mapName === 'Grimoak Grounds') {
      // The dirt-road patch leading south from Bramwick's own entrance
      // (a later follow-up ask: "about 10 feet" — GRIMOAK_GROUNDS_ROAD_ROWS
      // is the ~2.5ft/tile conversion of that, see its own doc comment),
      // same width as the castle's bridge for a visually consistent
      // "road" feel. Sits just above the base grass (-1) but below the
      // moat/bridge graphics below, which don't overlap it anyway.
      const roadWidthTiles = GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES * 2 + 1;
      this.roadTile = this.add
        .tileSprite(
          (CASTLE_DOOR_ON_GROUNDS.col - GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES) * TILE_SIZE,
          0,
          roadWidthTiles * TILE_SIZE,
          GRIMOAK_GROUNDS_ROAD_ROWS * TILE_SIZE,
          DIRT_ROAD_TEXTURE_KEY
        )
        .setOrigin(0, 0)
        .setDepth(-0.99);

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
      // North band now leaves the same bridge-width gap the south band
      // already did (a later follow-up ask: "the same bridge and gate
      // mechanism going north") — previously drawn as one unbroken span.
      fillTileBand(moat, MOAT_OUTER_TOP, MOAT_INNER_TOP - 1, MOAT_OUTER_LEFT, BRIDGE_COL_LEFT - 1, WATER);
      fillTileBand(moat, MOAT_OUTER_TOP, MOAT_INNER_TOP - 1, BRIDGE_COL_RIGHT + 1, MOAT_OUTER_RIGHT, WATER);
      fillTileBand(moat, MOAT_INNER_TOP, MOAT_INNER_BOTTOM, MOAT_OUTER_LEFT, MOAT_INNER_LEFT - 1, WATER);
      fillTileBand(moat, MOAT_INNER_TOP, MOAT_INNER_BOTTOM, MOAT_INNER_RIGHT + 1, MOAT_OUTER_RIGHT, WATER);
      fillTileBand(moat, MOAT_INNER_BOTTOM + 1, MOAT_OUTER_BOTTOM, MOAT_OUTER_LEFT, BRIDGE_COL_LEFT - 1, WATER);
      fillTileBand(moat, MOAT_INNER_BOTTOM + 1, MOAT_OUTER_BOTTOM, BRIDGE_COL_RIGHT + 1, MOAT_OUTER_RIGHT, WATER);
      this.moatGraphics = moat;

      const bridge = this.add.graphics().setDepth(-0.9);
      const PLANK = 0x8a6238;
      const PLANK_DARK = 0x5a3d24;
      const drawBridgeSpan = (rowStart: number, rowEnd: number) => {
        fillTileBand(bridge, rowStart, rowEnd, BRIDGE_COL_LEFT, BRIDGE_COL_RIGHT, PLANK);
        for (let row = rowStart; row <= rowEnd; row++) {
          fillTileBand(bridge, row, row, BRIDGE_COL_LEFT, BRIDGE_COL_LEFT, PLANK_DARK);
          fillTileBand(bridge, row, row, BRIDGE_COL_RIGHT, BRIDGE_COL_RIGHT, PLANK_DARK);
        }
      };
      drawBridgeSpan(MOAT_INNER_BOTTOM, MOAT_OUTER_BOTTOM);
      drawBridgeSpan(MOAT_OUTER_TOP, MOAT_INNER_TOP);
      this.bridgeGraphics = bridge;

      // The castle gate (a later follow-up ask) — sits at the bridge's
      // own outer end (GATE_ROW === MOAT_OUTER_BOTTOM), spanning its
      // exact width. Each leaf's own art is exactly half that width
      // (80px, see tools/gen-castle-gate.mjs), so closed they meet with
      // no gap; the right leaf is the identical texture horizontally
      // flipped rather than separate mirrored art. Starts CLOSED — the
      // very next map:state (which fires immediately on join, see
      // handleConnection) calls updateGateState and opens it right away
      // if a player's already standing nearby.
      const gateLeafWidth = CASTLE_GATE_LEAF_WIDTH_PX;
      const gateBottomY = (GATE_ROW + 1) * TILE_SIZE;
      this.gateLeftSprite = this.add
        .sprite(GATE_COL_LEFT * TILE_SIZE, gateBottomY, CASTLE_GATE_LEAF_TEXTURE_KEY)
        .setOrigin(0, 1)
        .setDepth(-0.85);
      this.gateRightSprite = this.add
        .sprite((GATE_COL_RIGHT + 1) * TILE_SIZE, gateBottomY, CASTLE_GATE_LEAF_TEXTURE_KEY)
        .setOrigin(1, 1)
        .setFlipX(true)
        .setDepth(-0.85);

      // The north gate (a later follow-up ask) — identical shape, sitting
      // at the NORTH bridge's own outer end (NORTH_GATE_ROW ===
      // MOAT_OUTER_TOP) instead, its leaf art anchored by the TOP of the
      // sprite (origin y:0) rather than the bottom, since it hangs from
      // the row ABOVE it rather than sitting on the row below.
      const northGateTopY = NORTH_GATE_ROW * TILE_SIZE;
      this.northGateLeftSprite = this.add
        .sprite(GATE_COL_LEFT * TILE_SIZE, northGateTopY, CASTLE_GATE_LEAF_TEXTURE_KEY)
        .setOrigin(0, 0)
        .setDepth(-0.85);
      this.northGateRightSprite = this.add
        .sprite((GATE_COL_RIGHT + 1) * TILE_SIZE, northGateTopY, CASTLE_GATE_LEAF_TEXTURE_KEY)
        .setOrigin(1, 0)
        .setFlipX(true)
        .setDepth(-0.85);
    }

    // Grimoak Castle's exterior + flying crows (item 4) — only on the
    // Grounds, positioned directly behind (north of) the castle door so
    // its glowing archway lines up with the actual entrance tile.
    this.tweens.killTweensOf(this.crowSprites);
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
    this.tweens.killTweensOf(this.fireplaceSprites);
    for (const sprite of this.fireplaceSprites) sprite.destroy();
    this.fireplaceSprites = [];
    // Half-sized in the small classrooms (a follow-up ask) — the large
    // rooms' own fireplaces stay full-size, just nudged toward the
    // center instead (see fireplacePositionsFor).
    // 'Specialization' gets the same half-size treatment for the same
    // "still classroom-sized, just not a CLASSROOM_MAPS entry anymore"
    // reason as isClassroomSized above.
    const fireplaceScale =
      (CLASSROOM_MAPS as readonly string[]).includes(mapName) ||
      mapName === 'Specialization' ||
      (SPECIALIZATION_CHAMBER_MAPS as readonly string[]).includes(mapName)
        ? 0.5
        : 1;
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
    // Clickable now (a follow-up ask) — opens a rest-confirmation modal
    // only if the player is actually close enough to receive the
    // enhanced-regeneration bonus itself (isNearBench, distance 1) — a
    // follow-up bug fix: this used to check the looser BENCH_REACH_TILES
    // (2 tiles), which let the modal open and the player sit down from a
    // distance the regen bonus (game.gateway.ts's own applyStatTick
    // restingOnBench check) never actually granted anything at. Same
    // shape as the beds below. Each one's own `angle` (see
    // benchPositionsFor) rotates it to face inward, toward the other
    // three.
    for (const sprite of this.benchSprites) sprite.destroy();
    this.benchSprites = [];
    for (const { row, col, angle } of benchPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const bench = this.add
        .sprite(pos.x, pos.y, BENCH_TEXTURE_KEY)
        .setOrigin(0.5, 0.85)
        .setAngle(angle)
        .setDepth(-0.5)
        .setInteractive();
      bench.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        if (!isNearBench(mapName, this.row, this.col)) {
          logCombatMessage("You're too far away to reach that bench.");
          return;
        }
        openBenchModal(row, col);
      });
      this.benchSprites.push(bench);
    }

    // The Dorms rooms' own 5 beds (a later follow-up ask) — clickable,
    // opens a sleep-confirmation modal if the player's within
    // BED_REACH_TILES, otherwise just a message (matching the server's
    // own re-validated reach check in handleSleepInBed).
    for (const sprite of this.bedSprites) sprite.destroy();
    this.bedSprites = [];
    for (const { row, col } of bedPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const bed = this.add.sprite(pos.x, pos.y, BED_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5).setInteractive();
      bed.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        if (!isWithinRadius(this.row, this.col, row, col, BED_REACH_TILES)) {
          logCombatMessage("You're too far away to use that bed.");
          return;
        }
        openBedModal(row, col);
      });
      this.bedSprites.push(bed);
    }

    // The Great Hall's own banquet table, faculty stage, and every chair
    // around both (a later follow-up ask) — furniture only, no click
    // handler, collision is server-side (see isGreatHallTableBlocked/
    // isGreatHallChairBlocked). The table/stage sprites are pre-sized (by
    // their own gen-long-table.mjs/gen-great-hall-stage.mjs) to exactly
    // match their own server-side footprint in pixels, so they're placed
    // by their top-left corner (origin 0,0) rather than tile-centered.
    this.greatHallTableSprite?.destroy();
    this.greatHallTableSprite = null;
    const tableFootprint = greatHallTableFootprint(mapName);
    if (tableFootprint) {
      this.greatHallTableSprite = this.add
        .sprite(tableFootprint.colStart * TILE_SIZE, tableFootprint.rowStart * TILE_SIZE, LONG_TABLE_TEXTURE_KEY)
        .setOrigin(0, 0)
        .setDepth(-0.5);
    }

    this.greatHallStageSprite?.destroy();
    this.greatHallStageSprite = null;
    const stageFootprint = greatHallStagePlatform(mapName);
    if (stageFootprint) {
      this.greatHallStageSprite = this.add
        .sprite(stageFootprint.colStart * TILE_SIZE, stageFootprint.rowStart * TILE_SIZE, GREAT_HALL_STAGE_TEXTURE_KEY)
        .setOrigin(0, 0)
        .setDepth(-0.6);
    }

    for (const sprite of this.greatHallChairSprites) sprite.destroy();
    this.greatHallChairSprites = [];
    for (const { row, col, angle, big } of greatHallChairPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const chair = this.add
        .sprite(pos.x, pos.y, big ? HEAD_CHAIR_TEXTURE_KEY : HALL_CHAIR_TEXTURE_KEY)
        .setOrigin(0.5, 0.85)
        .setAngle(angle)
        .setDepth(-0.5);
      this.greatHallChairSprites.push(chair);
    }

    // The castle's 4th floor own 4 decorative portals (a later follow-up
    // ask) — selectable (numbered "Portal 1"-4 for now, same setLockTarget
    // shape every door already uses; real mechanics come later) and
    // continuously spinning in place for a "swirling" look. Centered
    // (origin 0.5, 0.5) rather than floor-anchored like other props —
    // rotating around a bottom-anchored origin would swing the top
    // wildly instead of spinning cleanly in place. Collision is
    // server-side (see isPortalBlocked).
    for (const sprite of this.portalSprites) sprite.destroy();
    this.portalSprites = portalPositionsFor(mapName).map(({ row, col }, index) => {
      const pos = this.tilePosition(row, col);
      const sprite = this.add.sprite(pos.x, pos.y, PORTAL_TEXTURE_KEY).setOrigin(0.5, 0.5).setDepth(-0.5).setInteractive();
      this.tweens.add({ targets: sprite, angle: 360, duration: 5000, repeat: -1, ease: 'Linear' });
      const label = `Portal ${index + 1}`;
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        this.setLockTarget({ kind: 'door', map: mapName, row, col }, label);
      });
      return sprite;
    });

    // The road signs flanking Bramwick's own dirt-road entrance (a later
    // follow-up ask moved the original single "Bramwick" sign OUT to
    // Grimoak Grounds and put a new "Grimoak Grounds" one in Bramwick
    // instead) — each names the destination the road leads TO, not
    // wherever the player already is, same as a real road sign. Just
    // shows that name in the top-left target panel, same setLockTarget
    // shape every door already uses.
    for (const sprite of this.signSprites) sprite.destroy();
    const signDefs: Array<{ map: MapName; position: { row: number; col: number }; label: string }> = [
      { map: 'Grimoak Grounds', position: GRIMOAK_GROUNDS_SIGN_POSITION, label: 'Bramwick' },
      { map: 'Bramwick', position: BRAMWICK_SIGN_POSITION, label: 'Grimoak Grounds' },
    ];
    this.signSprites = signDefs
      .filter((def) => def.map === mapName)
      .map(({ position, label }) => {
        const pos = this.tilePosition(position.row, position.col);
        const sign = this.add.sprite(pos.x, pos.y, SIGN_TEXTURE_KEY).setOrigin(0.5, 0.9).setDepth(-0.5).setInteractive();
        sign.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (isInputCaptured() || !pointer.leftButtonDown()) return;
          this.setLockTarget({ kind: 'door', map: mapName, row: position.row, col: position.col }, label);
        });
        return sign;
      });

    // A later follow-up ask removed the podium/spellbook system entirely
    // — see WorldScene's teacher click handler (below) for the
    // click-to-learn modal that replaced it.
  }

  // Doors + the secret room's own treasure chest — split out of renderMap
  // (item 4's follow-up fix) so refreshing the chest's locked/unlocked
  // texture after a resera cast doesn't ALSO wipe every other transient
  // sprite (teacher, npc, monster, vendor, corpse, other players) the way
  // calling the whole renderMap did, leaving them missing until the next
  // 'map:state' broadcast repopulated them.
  private renderDoorsAndChest(mapName: MapName): void {
    const def = getMap(mapName);

    // One door sprite per exit — Great Plains alone now has three
    // (Labyrinth/Floro/Kortho), so a single reused sprite (the old
    // approach, from when every map had at most one exit) would only ever
    // show the first. Every exit uses the same fancy double door now (a
    // follow-up ask) — the old shop-vs-generic texture split is gone.
    for (const sprite of this.doorSprites) sprite.destroy();
    // 'open' exits (a later follow-up ask: "remove the door... walk
    // straight through") get no sprite at all — Bramwick's own north/
    // south entrance is a plain dirt road, not a door, in either
    // direction.
    this.doorSprites = def.exits
      .filter((exit) => exit.kind !== 'open')
      .map((exit) => {
      const pos = this.tilePosition(exit.row, exit.col);
      // Every reciprocal door pair lands you exactly on the tile that
      // triggers the return exit (see shared/maps.ts), so the player
      // stands ON a door sprite on every single transition. Without an
      // explicit depth, door sprites (recreated — and so re-inserted at
      // the top of the display list — on every renderMap call) rendered
      // OVER the player, hiding the sprite completely. Depth -0.5 keeps
      // them above the floor (-1) but below every character.
      const sprite =
        exit.kind === 'stairs'
          ? this.add.sprite(pos.x, pos.y, STAIRS_TEXTURE_KEY).setDepth(-0.5)
          : this.add.sprite(pos.x, pos.y, GRAND_DOOR_TEXTURE_KEY).setDepth(-0.5);

      // EVERY door is targetable/resera-able now (a follow-up ask: "make
      // all doors and treasure chests targetable" / "every door should
      // be able to have the resera spell possibly used on it") — clicking
      // one just selects it (same as clicking a monster), showing it in
      // the top-left panel with no hp bar. Whether it's actually a REAL
      // lock (only the secret room's own door is) is resolved entirely
      // server-side at CAST time (see game.gateway.ts's
      // handleCastResera) — a regular door just comes back with a "not
      // locked" message when resera is actually used on it, rather than
      // refusing the click/selection itself.
      sprite.setInteractive();
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        // A follow-up ask: name the destination in the top-left panel
        // (e.g. "Utility Classroom Door") instead of the bare generic
        // "Door" label, so a door's own purpose is clear at a glance.
        this.setLockTarget({ kind: 'door', map: mapName, row: exit.row, col: exit.col }, `${exit.toMap} Door`);
      });
      return sprite;
    });

    // Classroom door symbols (a follow-up ask) — a small icon to the
    // right of whichever door leads to a classroom, purely decorative
    // (not interactive), so a player can tell what's taught behind each
    // one at a glance. Previously floated above the door (row - 0.9
    // tiles), which for the Entrance Hall's own north-wall doors (row 0)
    // put it at a negative Y the camera's scroll bounds (fixed to start
    // at (0,0) — see applyCameraBounds) can never actually show, making
    // it permanently invisible there — to the side, same row, stays
    // on-grid and visible everywhere.
    for (const sprite of this.classroomSymbolSprites) sprite.destroy();
    this.classroomSymbolSprites = def.exits
      .filter((exit) => CLASSROOM_SYMBOL_TEXTURE_KEYS[exit.toMap])
      .map((exit) => {
        const pos = this.tilePosition(exit.row, exit.col + 1);
        return this.add.sprite(pos.x, pos.y, CLASSROOM_SYMBOL_TEXTURE_KEYS[exit.toMap]!).setDepth(-0.4);
      });

    // The secret room's own treasure chest (a later follow-up ask) — a
    // single sprite, textured by whether THIS player has already
    // resera'd it open (myProfile.secretChestUnlocked); clicking it
    // selects it AND calls openChest() server-side, which independently
    // re-validates the lock/reach/already-taken state.
    this.chestSprite?.destroy();
    this.chestSprite = null;
    if (mapName === 'Caverna Secretissima') {
      const pos = this.tilePosition(CAVERNA_CHEST_POSITION.row, CAVERNA_CHEST_POSITION.col);
      const unlocked = Boolean(myProfile?.secretChestUnlocked);
      const chest = this.add
        .sprite(pos.x, pos.y, unlocked ? CHEST_UNLOCKED_TEXTURE_KEY : CHEST_LOCKED_TEXTURE_KEY)
        .setOrigin(0.5, 0.85)
        .setDepth(-0.5)
        .setInteractive();
      chest.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        this.setLockTarget(
          { kind: 'chest', map: 'Caverna Secretissima', row: CAVERNA_CHEST_POSITION.row, col: CAVERNA_CHEST_POSITION.col },
          'Treasure Chest'
        );
        if (!isWithinRadius(this.row, this.col, CAVERNA_CHEST_POSITION.row, CAVERNA_CHEST_POSITION.col, 1)) {
          logCombatMessage("You're too far away to reach the chest.");
          return;
        }
        void this.network.openChest().then((ack) => {
          if (!ack.ok) {
            if (ack.message) logCombatMessage(ack.message);
            return;
          }
          openChestModal(ack.items ?? []);
        });
      });
      this.chestSprite = chest;
    }
  }

  // A door/chest "target" (a later follow-up ask) — same top-left panel a
  // monster's own selection uses, minus the hp bar (see
  // targetPanel.ts's updateLockTargetPanel). Mutually exclusive with the
  // ordinary monster/npc/player targetKind/targetId (only one thing shows
  // in that one panel at a time) — selecting a door/chest silently clears
  // whatever combat target was selected, and vice versa (see setTarget).
  private setLockTarget(target: LockTarget, label: string): void {
    this.lockTarget = target;
    this.targetKind = null;
    this.targetId = null;
    this.selectedStoneBlockId = null;
    this.selectedCorpseId = null;
    this.selectedPetId = null;
    updateLockTargetPanel(label);
  }

  // Persists until the player clicks elsewhere in the game world (a
  // follow-up ask: "It should stay selected until the player clicks
  // elsewhere on the screen that is not the action bar or skills") — see
  // handleLeftClick's own "clicked empty ground" branch, the only other
  // caller.
  private clearLockTarget(): void {
    this.lockTarget = null;
    hideTargetPanel();
  }

  // A summoned stone block "target" (a later follow-up ask) — same
  // top-left panel a monster's own selection uses (name + hp bar, unlike
  // the door/chest one above), mutually exclusive with every other
  // selection concept in the scene.
  private setBlockmanTarget(id: string, hp: number, maxHp: number): void {
    this.selectedStoneBlockId = id;
    this.targetKind = null;
    this.targetId = null;
    this.lockTarget = null;
    this.selectedCorpseId = null;
    this.selectedPetId = null;
    updateTargetPanel('Blockman', 1, hp, maxHp);
  }

  private clearBlockmanTarget(): void {
    this.selectedStoneBlockId = null;
    hideTargetPanel();
  }

  // A corpse "target" (a later follow-up ask) — see selectedCorpseId's
  // own doc comment; same top-left panel a door/chest's own lockTarget
  // uses (no hp bar), mutually exclusive with every other selection
  // concept in the scene.
  private setCorpseTarget(id: string, label: string): void {
    this.selectedCorpseId = id;
    this.targetKind = null;
    this.targetId = null;
    this.lockTarget = null;
    this.selectedStoneBlockId = null;
    this.selectedPetId = null;
    updateLockTargetPanel(label);
  }

  private clearCorpseTarget(): void {
    this.selectedCorpseId = null;
    hideTargetPanel();
  }

  // A pet "target" (a later follow-up ask) — same top-left panel a
  // monster's own selection uses (name + hp bar), mutually exclusive with
  // every other selection concept in the scene. Set by left-clicking a
  // pet sprite (see applyMapState); double-clicking opens the full detail
  // modal (see handleLeftClick's own double-click precedent for player/
  // npc/monster targets, mirrored in the pet sprite's own pointerdown
  // handler since a pet isn't a real combat target findTargetableAt scans
  // for).
  private setPetTarget(id: string, label: string, level: number, hp: number, maxHp: number): void {
    this.selectedPetId = id;
    this.targetKind = null;
    this.targetId = null;
    this.lockTarget = null;
    this.selectedStoneBlockId = null;
    this.selectedCorpseId = null;
    updateTargetPanel(label, level, hp, maxHp);
  }

  private clearPetTarget(): void {
    this.selectedPetId = null;
    hideTargetPanel();
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
    // A later follow-up bug fix: "when the player goes to the 2nd Floor,
    // their sprite doesn't actually appear until they move and then it
    // zooms in from the side of the screen" — renderMap's own
    // applyCameraBounds (below) sets up the new map's camera bounds/
    // startFollow using whatever position this.player sprite is CURRENTLY
    // at; positioning it here, before renderMap runs, means the camera's
    // very first bounds/follow calculation for the new map already uses
    // the correct new-map tile instead of wherever the player happened to
    // be standing on the OLD map a moment ago.
    const pos = this.tilePosition(player.row, player.col);
    this.player.setPosition(pos.x, pos.y);
    setMyProfile(player);
    loadActionBarOnce(player.username);
    updateStatusBar();
    updateMapButtonVisibility(Boolean(player.mapUnlocked));
    updateWorldLabel(player.map);
    notifyMapChanged();
    refreshOpenModals();
    this.updateTeacherQuestIcons();

    // 'sync' fires on every level-up, not just map transitions — calling
    // renderMap unconditionally used to wipe every other-player/NPC/
    // monster/corpse sprite on ANY sync, which briefly made autopilot see
    // zero monsters and think it had run out of targets. Only actually
    // tear down and rebuild the map when the map itself changed.
    if (!this.hasRenderedMap || player.map !== this.currentMap) {
      // A later follow-up ask: close whatever modal's open on any map
      // change this general 'sync' path catches too (recall, a portal,
      // stairs, ...), not just the ordinary door-walk case handled in
      // attemptMove's own move-ack above.
      closeAllModals();
      this.renderMap(player.map);
      this.hasRenderedMap = true;
    }
    // A later follow-up ask: a new (or respawning) character's spawn
    // point on Grimoak Grounds now sits right at the south bridge's
    // inner end, facing the castle — same MOAT_INNER_BOTTOM - 1 tile
    // shared/maps.ts's own GRIMOAK_GROUNDS_SPAWN uses, checked here
    // (rather than importing that constant) since 'up' should only ever
    // apply exactly there, not to every visit to Grimoak Grounds.
    if (player.map === 'Grimoak Grounds' && player.row === MOAT_INNER_BOTTOM - 1 && player.col === CASTLE_DOOR_ON_GROUNDS.col) {
      this.facing = 'up';
    }
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
    this.updateOwnWandSprite(isWandItem(player.equipment.weapon));
    this.updateOwnShieldSprite(player.equipment.shield === 'bone shield');
    // A torch burning out clears equipment.shield server-side and emits
    // exactly this 'sync' — without this, the held-torch overlay would
    // keep showing in the player's hand even though vision itself already
    // correctly reverted (that part is purely reactive to
    // myProfile.equipment, recomputed fresh every frame).
    this.updateOwnTorchSprite(player.equipment.shield === TORCH_ITEM);
    this.applyPose(this.player, player.dancing ? 'dancing' : player.restState, CHAR_SCALE);
  }

  // The castle gate's own open/closed visual (a later follow-up ask) —
  // purely a rendering decision derived from the same player positions
  // map:state already carries (mine plus everyone else's own p.row/
  // p.col), matching the exact same reach check the SERVER enforces for
  // collision (see shared/maps.ts's GATE_REACH_TILES/world-manager's
  // isGateOpen) — no separate payload field needed. Only re-tweens when
  // the open/closed state actually flips, same idempotency guard every
  // other pose/tween helper here uses.
  private updateGateState(state: MapStatePayload): void {
    if (state.mapName !== 'Grimoak Grounds') return;

    const withinReachOfRow = (gateRow: number, row: number, col: number): boolean =>
      Math.abs(row - gateRow) <= GATE_REACH_TILES && col >= GATE_COL_LEFT - GATE_REACH_TILES && col <= GATE_COL_RIGHT + GATE_REACH_TILES;

    if (this.gateLeftSprite && this.gateRightSprite) {
      const open =
        withinReachOfRow(GATE_ROW, this.row, this.col) || state.players.some((p) => withinReachOfRow(GATE_ROW, p.row, p.col));
      if (open !== this.gateOpen) {
        this.gateOpen = open;
        this.tweens.killTweensOf([this.gateLeftSprite, this.gateRightSprite]);
        const leftClosedX = GATE_COL_LEFT * TILE_SIZE;
        const rightClosedX = (GATE_COL_RIGHT + 1) * TILE_SIZE;
        this.tweens.add({
          targets: this.gateLeftSprite,
          x: open ? leftClosedX - CASTLE_GATE_LEAF_WIDTH_PX : leftClosedX,
          duration: 900,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: this.gateRightSprite,
          x: open ? rightClosedX + CASTLE_GATE_LEAF_WIDTH_PX : rightClosedX,
          duration: 900,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // The north gate (a later follow-up ask) — same open/closed logic,
    // its own independent state so standing at one gate doesn't swing the
    // other one open too (see world-manager's own isGateOpen, now
    // parameterized by gate row for the exact same reason).
    if (this.northGateLeftSprite && this.northGateRightSprite) {
      const open =
        withinReachOfRow(NORTH_GATE_ROW, this.row, this.col) || state.players.some((p) => withinReachOfRow(NORTH_GATE_ROW, p.row, p.col));
      if (open !== this.northGateOpen) {
        this.northGateOpen = open;
        this.tweens.killTweensOf([this.northGateLeftSprite, this.northGateRightSprite]);
        const leftClosedX = GATE_COL_LEFT * TILE_SIZE;
        const rightClosedX = (GATE_COL_RIGHT + 1) * TILE_SIZE;
        this.tweens.add({
          targets: this.northGateLeftSprite,
          x: open ? leftClosedX - CASTLE_GATE_LEAF_WIDTH_PX : leftClosedX,
          duration: 900,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: this.northGateRightSprite,
          x: open ? rightClosedX + CASTLE_GATE_LEAF_WIDTH_PX : rightClosedX,
          duration: 900,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // Public (a later follow-up bug fix: "teachers and benches... didn't
  // show up until I moved" after recall) — recallModal.ts isn't part of
  // WorldScene, so it needs a way to apply the `mapState` its own
  // castRecall ack now carries (see CastSpellAck's own doc comment)
  // instead of relying on the racy room-wide 'map:state' broadcast that
  // used to be the only source and could arrive before `currentMap` had
  // actually updated to the new room.
  applyMapState(state: MapStatePayload): void {
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

    this.updateGateState(state);

    const seenPlayers = new Set<string>();
    for (const p of state.players) {
      if (p.username === this.myUsername) continue;
      seenPlayers.add(p.username);

      // Invisibility (a later follow-up ask) — "monsters and players
      // cannot see the player while it's active": skip rendering this
      // OTHER player's sprite entirely (not just faded, like the
      // CASTER'S OWN view of themselves — see repositionHpBars).
      // Destroys whatever sprite already existed the instant they turn
      // invisible; simply not recreated while this stays true, then
      // picks back up normally the moment it clears.
      if (p.invisibleActive) {
        const existing = this.otherPlayers.get(p.username);
        if (existing) {
          this.destroyEntitySprite(existing);
          this.otherPlayers.delete(p.username);
          this.scutumGlows.get(p.username)?.destroy();
          this.scutumGlows.delete(p.username);
          this.wispSprites.get(p.username)?.destroy();
          this.wispSprites.delete(p.username);
          this.flightCloudSprites.get(p.username)?.destroy();
          this.flightCloudSprites.delete(p.username);
        }
        continue;
      }

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
      sprite.setData('scutumActive', p.scutumActive);
      sprite.setData('wispActive', p.wispActive);
      sprite.setData('flightActive', p.flightActive);
      sprite.setData('specialization', p.specialization ?? null);
      this.ensureHpBar(sprite, p.hp, p.maxHp);
      this.ensureWeaponSprite(sprite, p.equipment.weapon === 'bone dagger', (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureWandSprite(sprite, isWandItem(p.equipment.weapon), (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, p.equipment.shield === 'bone shield', (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureTorchSprite(sprite, p.equipment.shield === TORCH_ITEM, (sprite.getData('facing') as Facing) ?? 'down');
      this.applyPose(sprite, p.dancing ? 'dancing' : p.restState, CHAR_SCALE);
      if (this.targetKind === 'player' && this.targetId === p.username) updateTargetPanel(p.username, p.level, p.hp, p.maxHp);
    }
    for (const [username, sprite] of this.otherPlayers) {
      if (!seenPlayers.has(username)) {
        this.destroyEntitySprite(sprite);
        this.otherPlayers.delete(username);
        if (this.targetKind === 'player' && this.targetId === username) this.clearTarget();
        this.scutumGlows.get(username)?.destroy();
        this.scutumGlows.delete(username);
        this.wispSprites.get(username)?.destroy();
        this.wispSprites.delete(username);
        this.flightCloudSprites.get(username)?.destroy();
        this.flightCloudSprites.delete(username);
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
      const npcLabel = npc.label ?? 'training dummy';
      sprite.setData('race', npc.race);
      sprite.setData('label', npcLabel);
      sprite.setData('hp', npc.hp);
      sprite.setData('maxHp', npc.maxHp);
      sprite.setData('level', npc.level);
      this.ensureHpBar(sprite, npc.hp, npc.maxHp);
      // The training skeletons' own practice club (a follow-up ask) —
      // the only NPCs that carry anything today; every other NPC's
      // carriedItems is absent, so hasWeapon is false and the overlay
      // just stays hidden for them.
      const hasClub = (npc.carriedItems ?? []).some((item) => item.toLowerCase().includes('club'));
      this.ensureWeaponSprite(sprite, hasClub, (sprite.getData('facing') as Facing) ?? 'down', CLUB_TEXTURE_KEY);
      if (this.targetKind === 'npc' && this.targetId === npc.id) updateTargetPanel(npcLabel, npc.level, npc.hp, npc.maxHp);
    }

    const seenMonsters = new Set<string>();
    for (const m of state.monsters) {
      seenMonsters.add(m.id);

      // A rare variant (a later follow-up ask: "slightly bigger... AND
      // visually/name distinct, not just bigger") — a golden tint on top
      // of the existing scale bump, plus a "Rare " label prefix everywhere
      // its kind is shown (target panel, tooltip) so it doesn't just read
      // as "a slightly larger imp" at a glance.
      const displayLabel = m.isRare ? `Rare ${m.kind}` : m.kind;
      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) {
        const pos = this.tilePosition(m.row, m.col);
        sprite = this.add
          .sprite(pos.x, pos.y, textureKeyFor(m.kind), idleFrameFor(m.kind, 'down'))
          .setScale(m.isRare ? CHAR_SCALE * 1.35 : CHAR_SCALE);
        if (m.isRare) sprite.setTint(RARE_MONSTER_TINT);
        sprite.setData('row', m.row);
        sprite.setData('col', m.col);
        this.monsterSprites.set(m.id, sprite);
      } else {
        this.moveOrSnap(sprite, m.kind, m.row, m.col);
      }
      sprite.setData('kind', m.kind);
      sprite.setData('label', displayLabel);
      sprite.setData('hp', m.hp);
      sprite.setData('maxHp', m.maxHp);
      sprite.setData('level', m.level);
      sprite.setData('carriedItems', m.carriedItems);
      this.ensureHpBar(sprite, m.hp, m.maxHp);
      const hasWeapon = m.carriedItems.some((item) => item.toLowerCase().includes('dagger'));
      const hasShield = m.carriedItems.some((item) => item.toLowerCase().includes('shield'));
      this.ensureWeaponSprite(sprite, hasWeapon, (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, hasShield, (sprite.getData('facing') as Facing) ?? 'down');
      if (this.targetKind === 'monster' && this.targetId === m.id) updateTargetPanel(displayLabel, m.level, m.hp, m.maxHp);
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(id);
        if (this.targetKind === 'monster' && this.targetId === id) this.clearTarget();
      }
    }

    // A later follow-up bug fix: "multiple followers/summons do not
    // appear on top of each other... you couldn't even see the pet" — a
    // pet and an animated monster both walk toward their OWNER's own
    // exact tile server-side (unchanged), so with more than one follower
    // they can end up on the identical tile, rendering as one
    // indistinguishable sprite. Purely a client-side visual fix: each of
    // a given owner's own followers gets a small, stable pixel nudge in
    // a different direction, keyed by its own place in a combined
    // pet-then-animated-monsters ordering per owner (computed fresh every
    // map:state, so it's naturally stable frame to frame) — the first
    // one for any owner (their pet, if they have one) stays exactly
    // centered, matching how a lone follower always looked before this.
    const FOLLOWER_FAN_OFFSETS_PX: ReadonlyArray<{ x: number; y: number }> = [
      { x: 0, y: 0 },
      { x: -10, y: 6 },
      { x: 10, y: 6 },
      { x: -10, y: -6 },
      { x: 10, y: -6 },
    ];
    const followerIndexByKey = new Map<string, number>();
    {
      const perOwnerCount = new Map<string, number>();
      const assignFollowerIndex = (ownerUsername: string, key: string) => {
        const idx = perOwnerCount.get(ownerUsername) ?? 0;
        perOwnerCount.set(ownerUsername, idx + 1);
        followerIndexByKey.set(key, idx);
      };
      for (const p of state.pets) assignFollowerIndex(p.ownerUsername, `pet:${p.id}`);
      for (const m of state.animatedMonsters) assignFollowerIndex(m.ownerUsername, `am:${m.id}`);
    }
    const followerFanOffsetFor = (key: string): { x: number; y: number } => {
      const idx = followerIndexByKey.get(key) ?? 0;
      return FOLLOWER_FAN_OFFSETS_PX[idx % FOLLOWER_FAN_OFFSETS_PX.length]!;
    };

    // Companion pets (a later follow-up ask) — same create-or-update +
    // seen-set cleanup shape as monsters above, just a single static
    // frame (no directional walk cycle — see mapRender.ts's own
    // PET_TEXTURE_KEYS doc comment) and a tween instead of an instant
    // snap when it actually moves.
    const seenPets = new Set<string>();
    for (const pet of state.pets) {
      seenPets.add(pet.id);
      const petOffset = followerFanOffsetFor(`pet:${pet.id}`);
      let sprite = this.petSprites.get(pet.id);
      if (!sprite) {
        const pos = this.tilePosition(pet.row, pet.col);
        sprite = this.add
          .sprite(pos.x + petOffset.x, pos.y + petOffset.y, PET_TEXTURE_KEYS[pet.kind])
          .setOrigin(0.5, 0.9)
          .setDepth(-0.4)
          .setInteractive({ useHandCursor: true });
        sprite.setData('row', pet.row);
        sprite.setData('col', pet.col);
        this.petSprites.set(pet.id, sprite);
        // A later follow-up ask: "make it so other players pets are
        // selectable and they can be double clicked in order to see more
        // details including possible equipment" — same click-then-
        // double-click-within-DOUBLE_CLICK_MS pattern handleLeftClick's
        // own generic player/npc/monster targeting uses, just driven from
        // the pet sprite's own pointerdown instead of the scene-wide
        // findTargetableAt scan (a pet isn't a real combat target).
        sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (isInputCaptured() || !pointer.leftButtonDown()) return;
          const petSprite = this.petSprites.get(pet.id);
          if (!petSprite) return;
          const label = (petSprite.getData('label') as string | undefined) ?? pet.name;
          const petLevel = (petSprite.getData('level') as number | undefined) ?? pet.level;
          const hp = (petSprite.getData('hp') as number | undefined) ?? pet.hp;
          const maxHp = (petSprite.getData('maxHp') as number | undefined) ?? pet.maxHp;
          this.setPetTarget(pet.id, label, petLevel, hp, maxHp);
          const key = `pet:${pet.id}`;
          const now = Date.now();
          if (this.lastClickKey === key && now - this.lastClickAt < WorldScene.DOUBLE_CLICK_MS) {
            this.lastClickKey = null;
            openTargetInfoModal('pet', pet.id, petSprite);
          } else {
            this.lastClickKey = key;
            this.lastClickAt = now;
          }
        });
      } else {
        const prevRow = sprite.getData('row') as number;
        const prevCol = sprite.getData('col') as number;
        if (prevRow !== pet.row || prevCol !== pet.col) {
          sprite.setData('row', pet.row);
          sprite.setData('col', pet.col);
          const pos = this.tilePosition(pet.row, pet.col);
          pos.x += petOffset.x;
          pos.y += petOffset.y;
          this.tweens.add({ targets: sprite, x: pos.x, y: pos.y, duration: REMOTE_STEP_TWEEN_MS, ease: 'Linear' });
        }
      }
      sprite.setData('label', `${pet.name} (Lv ${pet.level})`);
      sprite.setData('level', pet.level);
      sprite.setData('hp', pet.hp);
      sprite.setData('maxHp', pet.maxHp);
      // For the pet detail modal (a later follow-up ask) — kept fresh
      // every tick, same as label/hp/maxHp above, so a click always reads
      // live data rather than whatever was true at sprite-creation time.
      sprite.setData('ownerUsername', pet.ownerUsername);
      sprite.setData('equipment', pet.equipment);
      sprite.setData('inventory', pet.inventory);
      this.ensureHpBar(sprite, pet.hp, pet.maxHp);
      sprite.setAlpha(pet.alive ? 1 : 0.4);
    }
    for (const [id, sprite] of this.petSprites) {
      if (!seenPets.has(id)) {
        this.destroyEntitySprite(sprite);
        this.petSprites.delete(id);
        if (this.selectedPetId === id) this.clearPetTarget();
      }
    }
    // Animated monsters (a later follow-up ask's necromancer spell) —
    // same create-or-update + seen-set cleanup shape as pets above,
    // reusing the ordinary monster spritesheet/idle frame for its kind
    // (see textureKeyFor/idleFrameFor above) with a violet tint so a
    // raised corpse still reads as distinct from a live monster.
    const seenAnimatedMonsters = new Set<string>();
    for (const am of state.animatedMonsters) {
      seenAnimatedMonsters.add(am.id);
      const amOffset = followerFanOffsetFor(`am:${am.id}`);
      let sprite = this.animatedMonsterSprites.get(am.id);
      if (!sprite) {
        const pos = this.tilePosition(am.row, am.col);
        sprite = this.add
          .sprite(pos.x + amOffset.x, pos.y + amOffset.y, textureKeyFor(am.monsterKind), idleFrameFor(am.monsterKind, 'down'))
          // Diabolist's own demon imp (a later follow-up ask) — "a
          // little smaller than the imps on Grimoak Grounds," same
          // shape as the rare-monster upscale below just downward.
          .setScale(am.monsterKind === DEMON_IMP_KIND ? CHAR_SCALE * 0.85 : CHAR_SCALE)
          .setTint(0x9a7bd6);
        sprite.setData('row', am.row);
        sprite.setData('col', am.col);
        this.animatedMonsterSprites.set(am.id, sprite);
      } else {
        const prevRow = sprite.getData('row') as number;
        const prevCol = sprite.getData('col') as number;
        if (prevRow !== am.row || prevCol !== am.col) {
          sprite.setData('row', am.row);
          sprite.setData('col', am.col);
          const pos = this.tilePosition(am.row, am.col);
          pos.x += amOffset.x;
          pos.y += amOffset.y;
          this.tweens.add({ targets: sprite, x: pos.x, y: pos.y, duration: REMOTE_STEP_TWEEN_MS, ease: 'Linear' });
        }
      }
      sprite.setData('label', am.name);
      sprite.setData('hp', am.hp);
      sprite.setData('maxHp', am.maxHp);
      this.ensureHpBar(sprite, am.hp, am.maxHp);
      sprite.setAlpha(am.alive ? 1 : 0.4);
    }
    for (const [id, sprite] of this.animatedMonsterSprites) {
      if (!seenAnimatedMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.animatedMonsterSprites.delete(id);
      }
    }

    // A later follow-up ask: "the corpses of pets should be selectable
    // and should open a modal so that the player can grab any items or
    // equipment the pet had and the pet should be sacrificable" — same
    // create-or-update + seen-set cleanup + click-to-loot shape as the
    // ordinary corpse loop below, reusing the pet's own sprite (tinted/
    // faded to read as lifeless) rather than a whole separate asset.
    const seenPetCorpses = new Set<string>();
    for (const pc of state.petCorpses) {
      seenPetCorpses.add(pc.id);
      if (this.petCorpseSprites.has(pc.id)) continue;

      const pos = this.tilePosition(pc.row, pc.col);
      const sprite = this.add
        .sprite(pos.x, pos.y, PET_TEXTURE_KEYS[pc.kind])
        .setOrigin(0.5, 0.9)
        .setDepth(-1)
        .setTint(0x666666)
        .setAlpha(0.7)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        this.setCorpseTarget(pc.id, `${pc.name}'s corpse`);
        if (!this.isWithinLootReach(pc.row, pc.col)) {
          logCombatMessage("You're too far away to loot that.");
          return;
        }
        // A later follow-up ask: "only the player themself should be
        // able to sacrifice their own pet's corpse" — same "don't even
        // open the modal, just say so" shape the monster-corpse
        // killedBy check above uses, but stricter (no free-for-all case
        // — a pet corpse always has a real owner).
        if (pc.ownerUsername !== this.myUsername) {
          logCombatMessage("That's not your pet.");
          return;
        }
        openPetCorpseModal(pc.id, pc.name, pc.items);
      });
      this.petCorpseSprites.set(pc.id, sprite);
    }
    for (const [id, sprite] of this.petCorpseSprites) {
      if (!seenPetCorpses.has(id)) {
        sprite.destroy();
        this.petCorpseSprites.delete(id);
        if (this.selectedCorpseId === id) this.clearCorpseTarget();
      }
    }

    // The group panel shows both at once now (a later follow-up ask's
    // animate dead spell added a 2nd kind of group member) — a single
    // render call covers "no companions at all" through "a pet plus up
    // to 2 animated monsters".
    this.myPet = state.pets.find((p) => p.ownerUsername === this.myUsername) ?? null;
    this.myAnimatedMonsters = state.animatedMonsters.filter((m) => m.ownerUsername === this.myUsername);
    updateGroupPanel(this.myPet, this.myAnimatedMonsters);

    // Murus lapideus's own stone blocks (a later follow-up ask) — same
    // create-or-update + seen-set cleanup shape as monsters above, since
    // these come and go dynamically too (destroyed early or expiring).
    // Selectable (a later follow-up ask: "so the player can see the
    // health and name") via its own selectedStoneBlockId, a separate
    // concept from targetKind/targetId — same "doesn't need real combat
    // targeting" reasoning as lockTarget.
    const seenStoneBlocks = new Set<string>();
    for (const b of state.stoneBlocks) {
      seenStoneBlocks.add(b.id);
      let sprite = this.stoneBlockSprites.get(b.id);
      if (!sprite) {
        const pos = this.tilePosition(b.row, b.col);
        sprite = this.add.sprite(pos.x, pos.y, STONE_BLOCK_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5).setInteractive();
        sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (isInputCaptured() || !pointer.leftButtonDown()) return;
          this.setBlockmanTarget(b.id, b.hp, b.maxHp);
        });
        this.stoneBlockSprites.set(b.id, sprite);
      }
      this.ensureHpBar(sprite, b.hp, b.maxHp);
      if (this.selectedStoneBlockId === b.id) updateTargetPanel('Blockman', 1, b.hp, b.maxHp);
    }
    for (const [id, sprite] of this.stoneBlockSprites) {
      if (!seenStoneBlocks.has(id)) {
        this.destroyEntitySprite(sprite);
        this.stoneBlockSprites.delete(id);
        if (this.selectedStoneBlockId === id) this.clearBlockmanTarget();
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
        // A later follow-up ask: "a corpse is selectable and can be seen
        // as the selection in the top left" — same top-left panel a
        // door/chest's own lockTarget selection uses (no hp bar; a
        // corpse has none to show), regardless of reach — selecting
        // something and being in range to ACT on it are separate checks,
        // same as every other target kind here.
        this.setCorpseTarget(c.id, `${c.kind} corpse`);
        // A follow-up ask: don't even open the modal if the player is
        // too far away — just say so, same reach as actually looting.
        if (!this.isWithinLootReach(c.row, c.col)) {
          logCombatMessage("You're too far away to loot that.");
          return;
        }
        // A later follow-up ask: "if a player clicks on a corpse that
        // they did not kill then show a message that they cannot loot
        // that corpse" — same "don't even open the modal, just say so"
        // shape as the reach check above. killedBy undefined (the
        // training dummy — see corpse-manager.service.ts's own doc
        // comment) stays free-for-all, matching the server's own
        // canLootCorpse check.
        if (c.killedBy !== undefined && c.killedBy !== this.myUsername) {
          logCombatMessage('You cannot loot that corpse — it was killed by another player.');
          return;
        }
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
        if (this.selectedCorpseId === id) this.clearCorpseTarget();
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

      // hasDesk: false (a follow-up ask's Headmistress) skips the desk
      // sprite entirely — she stands between the fireplaces, not at a
      // classroom desk (see server/worlds/teachers.ts's own comment).
      // Always one tile south of the teacher, regardless of which way
      // their own sprite faces (a later follow-up ask reverted a brief
      // facing-aware version — see server/worlds/teachers.ts's
      // deskPositionFor for why).
      if (t.hasDesk !== false) {
        const deskPos = this.tilePosition(t.row + 1, t.col);
        const deskSprite = this.add.sprite(deskPos.x, deskPos.y, CLASSROOM_DESK_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5);
        this.teacherDeskSprites.set(t.id, deskSprite);
      }

      const pos = this.tilePosition(t.row, t.col);
      // No useHandCursor here — same reasoning as the spellbook podiums'
      // own "No useHandCursor here" comment above: the unified pointermove
      // handler in create() owns the cursor for every non-default hover
      // case (sword/feather/help/pointer) now, and fighting Phaser's own
      // hover cursor here is what silently broke it before (see that
      // handler's own comment).
      // A distinct robe color per teacher (a follow-up ask) — a fully
      // recolored variant spritesheet, same frame layout as the base
      // 'teacher' sheet (see characterSprites.ts's TeacherVariantKind).
      // Long hair (a later follow-up ask, female teachers only) is its
      // own further variant of that same recolored sheet.
      const teacherKind = t.robeColorKey ? (`teacher-${t.robeColorKey}${t.longHair ? '-longhair' : ''}` as const) : 'teacher';
      // A follow-up ask: "update the teacher titles... to be their name
      // and their position" — e.g. "Professor Caldwell, House
      // Administrator". Falls back to the plain name for every teacher
      // without a distinct role (every classroom/chamber teacher).
      const teacherDisplayName = t.title ? `${t.name}, ${t.title}` : t.name;
      const sprite = this.add
        .sprite(pos.x, pos.y, textureKeyFor(teacherKind), idleFrameFor(teacherKind, t.facing ?? 'down'))
        .setScale(CHAR_SCALE)
        .setInteractive();
      sprite.setData('questIds', t.questIds);
      sprite.setData('specializationGate', t.specializationGate);
      sprite.setData('houseChoiceGate', t.houseChoiceGate);
      sprite.setData('teachesSkills', t.teachesSkills);
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isInputCaptured() || !pointer.leftButtonDown()) return;
        // A follow-up ask: the Headmistress opens a dialogue modal (with
        // a quest to accept) instead of the plain classroom-teacher
        // tooltip, and requires the player be close enough — same reach
        // concept ("must be within [a few] feet... otherwise show a
        // message") as a shop's own SHOP_REACH_TILES.
        // A later follow-up ask: "Choosing a House should be available at
        // the same time as The Hidden Map... offer both options" — every
        // quest this teacher has gets its own fully independent block in
        // the SAME dialogue now (see openNpcDialogueModal), not one at a
        // time.
        if (t.questIds && t.questIds.length > 0) {
          if (!isWithinRadius(this.row, this.col, t.row, t.col, SHOP_REACH_TILES)) {
            logCombatMessage(`You're too far away to talk to ${teacherDisplayName}.`);
            return;
          }
          openNpcDialogueModal(teacherDisplayName, t.questIds);
          return;
        }
        // The Specialization room's own teacher (a later follow-up ask)
        // — no quest, just a level-gated dialogue, same reach concept.
        if (t.specializationGate) {
          if (!isWithinRadius(this.row, this.col, t.row, t.col, SHOP_REACH_TILES)) {
            logCombatMessage(`You're too far away to talk to ${teacherDisplayName}.`);
            return;
          }
          openSpecializationDialogue(teacherDisplayName);
          return;
        }
        // The Entrance Hall's own house-assignment teacher (a later
        // follow-up ask) — no quest, just a one-time choice, same reach
        // concept.
        if (t.houseChoiceGate) {
          if (!isWithinRadius(this.row, this.col, t.row, t.col, SHOP_REACH_TILES)) {
            logCombatMessage(`You're too far away to talk to ${teacherDisplayName}.`);
            return;
          }
          openHouseChoiceDialogue(teacherDisplayName);
          return;
        }
        // Every classroom/specialization teacher who offers skills through
        // the click-to-learn modal (a later follow-up ask replaced the
        // podium system) — same reach concept.
        if (t.teachesSkills && t.teachesSkills.length > 0) {
          if (!isWithinRadius(this.row, this.col, t.row, t.col, SHOP_REACH_TILES)) {
            logCombatMessage(`You're too far away to talk to ${teacherDisplayName}.`);
            return;
          }
          openTeacherLearnDialogue(teacherDisplayName, t.teachesSkills);
          return;
        }
        // A fixed, generic line (a later follow-up ask dropped the
        // earlier per-classroom "<Subject>. Please study from the
        // podium." framing entirely, now that Utilization's classroom has
        // TWO podiums — "podiums" plural reads correctly everywhere).
        // Also logged to the chat/log window (a later follow-up ask) —
        // the floating world-space bubble fades after a couple seconds,
        // easy to miss; the log keeps a permanent record of it too.
        const teacherMessage = 'Please study from the podiums.';
        this.showTeacherTooltip(sprite, teacherMessage);
        logCombatMessage(teacherMessage);
      });
      this.teacherSprites.set(t.id, sprite);

      // A quest-giver's own status icon (a later follow-up ask) — same
      // "above the head" offset HP bars use elsewhere, nudged up a
      // little further since there's no HP bar here to clear.
      if (t.questIds && t.questIds.length > 0) {
        const iconSprite = this.add
          .sprite(pos.x, pos.y + HP_BAR_OFFSET_Y - 8, QUEST_ICON_TEXTURE_KEY, QUEST_ICON_NOT_STARTED_FRAME)
          .setDepth(1);
        iconSprite.setData('questIds', t.questIds);
        this.teacherQuestIconSprites.set(t.id, iconSprite);
      }
    }
    this.updateTeacherQuestIcons();
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
        if (items.length > 0) logCombatMessage(`You pick up the ${stackedItemsLabel(items)}.`);

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

  // A small wind-streak effect while walking with celeritas active (a
  // follow-up ask) — a few short lines trailing behind the direction of
  // travel, drifting further back and fading out over the walk's own
  // duration. Plain Graphics rather than a texture asset, same "Graphics
  // for an ephemeral visual effect" treatment the fireplace flame/wand
  // glow already use.
  private spawnWindEffect(direction: Direction): void {
    const { dr, dc } = DIRECTION_DELTAS[direction];
    const behindX = -dc;
    const behindY = -dr;
    const duration = this.effectiveMoveCooldownMs();
    for (let i = 0; i < 3; i++) {
      // Perpendicular spread so the 3 streaks fan out a little instead of
      // stacking exactly on top of each other.
      const spread = (i - 1) * 6;
      const perpX = -behindY * spread;
      const perpY = behindX * spread;
      const startX = this.player.x + behindX * (TILE_SIZE * 0.3) + perpX;
      const startY = this.player.y + behindY * (TILE_SIZE * 0.3) + perpY - 6;
      const line = this.add.graphics().setDepth(1.1);
      line.lineStyle(2, 0xbfe6ff, 0.8);
      line.beginPath();
      line.moveTo(0, 0);
      line.lineTo(behindX * 10, behindY * 10);
      line.strokePath();
      line.setPosition(startX, startY);
      this.tweens.add({
        targets: line,
        x: startX + behindX * TILE_SIZE * 0.6,
        y: startY + behindY * TILE_SIZE * 0.6,
        alpha: 0,
        duration,
        delay: i * 40,
        onComplete: () => line.destroy(),
      });
    }
  }

  private attemptMove(direction: Direction): void {
    this.facing = facingForDirection(direction);
    // Flight (a later follow-up ask: "the player sprite is not walking,
    // but instead floating/flying along") — holds the idle frame instead
    // of the walk cycle; the wind trail (same effect celeritas uses)
    // doubles as the flying visual cue.
    if (myProfile?.flightActive) this.player.setTexture(textureKeyFor(this.displayKind()), idleFrameFor(this.displayKind(), this.facing));
    else this.player.play(walkAnimKey(this.displayKind(), this.facing), true);
    this.isMoving = true;
    if (myProfile?.celeritasActive || myProfile?.flightActive) this.spawnWindEffect(direction);

    this.network
      .move(direction)
      .then((ack) => {
        if (!ack.ok) {
          // A follow-up ask: rejected moves (the house gate specifically,
          // but this covers every other rejection reason too — the town
          // gate, the secret door, paralysis, rate-limiting) never showed
          // WHY the move failed at all.
          if (ack.message) logCombatMessage(ack.message);
          this.isMoving = false;
          this.setIdle();
          return;
        }

        this.row = ack.player.row;
        this.col = ack.player.col;

        if (ack.player.map !== this.currentMap) {
          // A later follow-up ask: "when the player goes through a door
          // and a modal is open, close that modal when they appear in
          // the next area" — a shop/teacher-dialogue/inventory modal left
          // open while walking through a door no longer made sense to
          // still be showing once the player's actually somewhere else
          // entirely.
          closeAllModals();
          // A map transition is a load, not a walk — snap straight to the
          // new map rather than tweening across two different worlds.
          this.race = ack.player.race;
          this.gender = ack.player.gender;
          this.hairColor = ack.player.hairColor;
          this.skinTone = ack.player.skinTone;
          this.mimicForm = ack.player.mimicForm;
          // A follow-up bug fix: "movement is not actually being
          // deducted when the player moves" — this used to only splice
          // in the new `map` field, silently discarding every OTHER
          // field the move ack's own snapshot carries (mv chief among
          // them, since every successful move costs MV_COST_PER_TILE
          // server-side). ack.player is already a full, authoritative
          // PlayerSnapshot, so just replace myProfile with it outright.
          setMyProfile(ack.player);
          this.updateOwnBars();
          // A later follow-up bug fix: "when the player goes to the 2nd
          // Floor, their sprite doesn't actually appear until they move
          // and then it zooms in from the side of the screen" —
          // renderMap's own applyCameraBounds (below) sets up the new
          // map's camera bounds/startFollow using whatever position
          // this.player sprite is CURRENTLY at; positioning it here,
          // before renderMap runs, means the camera's very first bounds/
          // follow calculation for the new map already uses the correct
          // new-map tile instead of wherever the player happened to be
          // standing on the OLD map a moment ago.
          const pos = this.tilePosition(ack.player.row, ack.player.col);
          this.player.setPosition(pos.x, pos.y);
          this.renderMap(ack.player.map);
          // A follow-up bug fix: "teachers & desks or training skeletons
          // were visible until I moved" — the server's own room-broadcast
          // 'map:state' for the destination can race this ack (arriving
          // before renderMap above has updated this.currentMap, so
          // applyMapState's own "wrong map" guard silently dropped it,
          // with nothing left to re-deliver it until incidental activity
          // on the new map triggered another broadcast). ack.mapState
          // rides along on exactly this ack instead, applied now that
          // this.currentMap already matches it.
          if (ack.mapState) this.applyMapState(ack.mapState);
          updateWorldLabel(ack.player.map);
          notifyMapChanged();
          this.isMoving = false;
          this.setIdle();
          return;
        }

        // Same bug fix as the map-transition branch above — every
        // successful move (not just ones that cross onto a new map)
        // deducts mv server-side, so myProfile needs the fresh snapshot
        // every time, not just on a map change.
        setMyProfile(ack.player);
        this.updateOwnBars();
        // A later follow-up ask: "the character sheet even while open
        // [should] automatically update with hp/mana/movement/hunger/
        // thirst changes" — updateOwnBars only ever refreshed the top-
        // left status bar; nothing here told an already-OPEN modal (the
        // character sheet chief among them, since mv only ever changes
        // on a move) to re-render with the fresh snapshot until some
        // unrelated event (a combat hit, the next statTick) happened to
        // trigger one. Scoped to just the character sheet (a later
        // follow-up bug fix: the blanket refreshOpenModals() this used to
        // call also rebuilt every OTHER open modal on every single move,
        // including the Skills panel's own icons — see
        // refreshCharSheetIfOpen's own doc comment).
        refreshCharSheetIfOpen();
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
    this.engageDefaultAttack(found.kind, found.id);
  }

  // A later follow-up ask: "when the follower goes and attacks a target
  // the player should begin to auto attack or auto move toward the
  // monster... similar to right clicking" — this IS right-click's own
  // engage logic, just triggered by the server's followerEngaged signal
  // instead of a mouse click, so the follower actually gets backup
  // instead of fighting alone while the player stands there.
  private handleFollowerEngaged(targetKind: 'monster' | 'player', targetId: string): void {
    if (this.isMoving || this.isPunching) return;
    const sprite = this.spriteMapFor(targetKind).get(targetId);
    if (!sprite) return;
    this.setTarget(targetKind, targetId, sprite);
    this.engageDefaultAttack(targetKind, targetId);
  }

  // Shared by right-click and the 'x' hotkey's own "start" side (a later
  // follow-up ask made 'x' a real toggle rather than only ever stopping)
  // — whichever default attack the player's currently equipped for
  // (wand's ranged bolt, or melee punch/dagger).
  private engageDefaultAttack(kind: 'player' | 'npc' | 'monster', id: string): void {
    this.autoAttacking = true;
    // A follow-up ask: right-clicking (or now, toggling on) with a wand
    // equipped fires the wand's own RANGED auto-attack instead of walking
    // into melee range — same "engage, then it's automatic" shape, just
    // no walking-closer step, since a ranged weapon staying at range is
    // the whole point.
    if (isWandItem(myProfile?.equipment.weapon)) {
      this.tryRangedEngage(kind, id);
      return;
    }
    const defaultSkill = myProfile?.equipment.weapon?.toLowerCase().includes('dagger') ? DAGGER_SKILL : PUNCH_SKILL;
    this.tryEngage(kind, id, defaultSkill);
  }

  // The wand's ranged auto-attack (a follow-up ask) — no walking involved
  // (unlike tryEngage's melee approach): just asks the server to arm/
  // refresh the sustained session, which is the sole authority on range/
  // wand-equipped and returns an immediate rejection message if either
  // isn't met — same "let the server decide, just show what it says"
  // shape as castAugue.
  private tryRangedEngage(kind: 'player' | 'npc' | 'monster', id: string): void {
    this.tryRangedAction(kind, id, SPELL_ATTACK_RANGE_TILES, () => {
      void this.network.engageRangedAttack({ targetKind: kind, targetId: id }).then((ack) => {
        if (!ack.ok && ack.message) logCombatMessage(ack.message);
      });
    });
  }

  // The 'x' hotkey (a later follow-up ask) — stops whatever auto-attack
  // loop (melee or ranged) is currently armed server-side. Doesn't clear
  // the local target selection, only the automatic attacking.
  stopAutoAttack(): void {
    this.network.disengage();
    this.approach = null;
    this.autoAttacking = false;
    logCombatMessage('You stop attacking.');
  }

  // The 'x' hotkey, now a real toggle (a later follow-up ask: "when I am
  // not auto attacking and I have a monster selected and I press 'x' it
  // should make me begin auto attacking, like a toggle") — starts the
  // same default attack right-click would, using whatever's already
  // selected, if nothing's currently engaged; stops it (old behavior)
  // otherwise.
  toggleAutoAttack(): void {
    if (this.autoAttacking) {
      this.stopAutoAttack();
      return;
    }
    if ((this.targetKind !== 'monster' && this.targetKind !== 'player') || !this.targetId) {
      logCombatMessage('Select a monster or player to attack first.');
      return;
    }
    this.engageDefaultAttack(this.targetKind, this.targetId);
  }

  // The 'z' hotkey (a later follow-up ask): "if the player has a pet/
  // summon/animated undead (follower) and... a selected target that can
  // be attacked... send the monster to auto attack the target." Requires
  // both a living follower and a currently selected monster/player target
  // (not an npc/door/chest/Blockman/corpse — those aren't attackable).
  commandFollowerAttack(): void {
    const hasFollower = (this.myPet?.alive ?? false) || this.myAnimatedMonsters.some((m) => m.alive);
    if (!hasFollower) {
      logCombatMessage("You don't have a pet or summoned creature to send.");
      return;
    }
    if ((this.targetKind !== 'monster' && this.targetKind !== 'player') || !this.targetId) {
      logCombatMessage('Select a monster or player to attack first.');
      return;
    }
    void this.network.commandFollowerAttack({ targetKind: this.targetKind, targetId: this.targetId }).then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
    });
  }

  // The flight spell's own spacebar burst (a later follow-up ask): "press
  // spacebar while flying" to dash forward in the CURRENT facing
  // direction — converts this.facing (up/down/left/right, the sprite's
  // own rendering concept) back to the wire Direction, the inverse of
  // mapRender's own facingForDirection.
  triggerFlightBurst(): void {
    if (isInputCaptured() || this.isMoving) return;
    if (!myProfile?.flightActive) {
      logCombatMessage('You must be flying to use a flight burst.');
      return;
    }
    const direction: Direction = this.facing === 'up' ? 'north' : this.facing === 'down' ? 'south' : this.facing === 'left' ? 'west' : 'east';
    void this.network.flightBurst(direction).then((ack) => {
      if (ack.message) {
        showCenterToast(ack.message);
        logCombatMessage(ack.message);
      }
      setMyProfile(ack.player);
      this.updateOwnBars();
      if (!ack.ok) return;
      const pos = this.tilePosition(ack.player.row, ack.player.col);
      this.row = ack.player.row;
      this.col = ack.player.col;
      this.tweens.add({ targets: this.player, x: pos.x, y: pos.y, duration: 150 });
    });
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
    // Murus lapideus (a later follow-up ask: "the player must first click
    // the spell and then click a spot on the map") — armed by
    // useTargetedSkill's own STONE_WALL_SKILL branch; this consumes
    // the NEXT click anywhere in the world as the summon's target tile,
    // taking priority over every other click handling below.
    if (this.murusLapideusTargeting) {
      this.murusLapideusTargeting = false;
      const { row, col } = this.tileAt(pointer.worldX, pointer.worldY);
      void this.network.castMurusLapideus({ row, col }).then((ack) => {
        // A follow-up bug fix (see the stupefaciunt branch's own comment
        // above) — the success message was silently dropped here too.
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
      return;
    }
    // Clicking anywhere in the game world deselects whatever inventory
    // item was targeted for drink/pour/irrigo (item 10's follow-up ask,
    // "selecting anywhere else") — the same "clicking elsewhere clears
    // the old selection" precedent the player/monster target below
    // already follows for itself.
    this.clearItemTarget();
    const found = this.findTargetableAt(pointer.worldX, pointer.worldY);
    if (!found) {
      // Clicking empty ground deselects whatever was targeted — but a
      // click that actually landed on a corpse, vendor, or pet (handled
      // entirely by their own pointerdown listeners) isn't "empty
      // ground", just not a combat-targetable entity; leave the
      // COMBAT target alone (unchanged, long-standing behavior).
      const hitCombatPassthrough = [...this.corpseSprites.values(), ...this.vendorSprites.values(), ...this.petSprites.values()].some((s) =>
        s.getBounds().contains(pointer.worldX, pointer.worldY)
      );
      if (!hitCombatPassthrough && this.targetKind) this.clearTarget();
      // The lock target (a follow-up ask) stays selected until the
      // player clicks elsewhere in the game world — a door/chest click
      // already set it via their own pointerdown handler (see
      // renderDoorsAndChest), so skip clearing it right back out on the
      // SAME click; any other click here (corpse, vendor, empty ground)
      // does count as "elsewhere" and drops it.
      // A follow-up bug fix: portals/the Bramwick sign use this same
      // setLockTarget shape as doors/the chest (see their own
      // pointerdown handlers above), but were missing from this list —
      // meaning the SAME click that just selected one of them via its
      // own handler was immediately undone right here, since `lockTarget`
      // was set but `hitLockable` came back false ("selectable... doesn't
      // seem to be working").
      const hitLockable = [
        ...this.doorSprites,
        ...(this.chestSprite ? [this.chestSprite] : []),
        ...this.portalSprites,
        ...this.signSprites,
      ].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      if (!hitLockable && this.lockTarget) this.clearLockTarget();
      // Same "already handled by its own pointerdown handler, don't
      // immediately undo it" reasoning for a Blockman selection.
      const hitBlockman = [...this.stoneBlockSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      if (!hitBlockman && this.selectedStoneBlockId) this.clearBlockmanTarget();
      // Same "already handled by its own pointerdown handler on this
      // SAME click, don't immediately undo it" reasoning for a corpse
      // selection.
      const hitCorpse = [...this.corpseSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      if (!hitCorpse && this.selectedCorpseId) this.clearCorpseTarget();
      // Same "already handled by its own pointerdown handler on this
      // SAME click, don't immediately undo it" reasoning for a pet
      // selection (a later follow-up ask).
      const hitPet = [...this.petSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      if (!hitPet && this.selectedPetId) this.clearPetTarget();
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
    // Mutually exclusive with the lock target and Blockman selection (a
    // follow-up ask) — only one thing shows in the top-left panel at a
    // time.
    this.lockTarget = null;
    this.selectedStoneBlockId = null;
    this.selectedCorpseId = null;
    this.selectedPetId = null;
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
    this.autoAttacking = false;
    hideTargetPanel();
  }

  // Read by the action bar when a slotted skill is clicked — "the
  // currently selected target," if any.
  getTarget(): { kind: 'player' | 'npc' | 'monster'; id: string } | null {
    if (!this.targetKind || !this.targetId) return null;
    return { kind: this.targetKind, id: this.targetId };
  }

  // Read by the global Escape handler (a follow-up ask) — mutually
  // exclusive with each other (see setTarget/setLockTarget), so checking
  // all three covers "is anything selected right now" regardless of
  // which kind it is.
  hasSelection(): boolean {
    return Boolean(this.targetKind || this.lockTarget || this.selectedStoneBlockId || this.selectedCorpseId || this.selectedPetId);
  }

  clearSelection(): void {
    if (this.targetKind) this.clearTarget();
    if (this.lockTarget) this.clearLockTarget();
    if (this.selectedStoneBlockId) this.clearBlockmanTarget();
    if (this.selectedCorpseId) this.clearCorpseTarget();
    if (this.selectedPetId) this.clearPetTarget();
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
        if (skillName === WATERFILL_SKILL) showCenterToast(ack.message);
      }
      if (!ack.ok || !myProfile) return;
      setMyProfile({
        ...myProfile,
        canteenDrinks: ack.canteenDrinks ?? myProfile.canteenDrinks,
        mana: ack.mana ?? myProfile.mana,
        thirst: ack.thirst ?? myProfile.thirst,
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
  //
  // Dexterity (a later follow-up ask: "every point increase should be a
  // slightly noticeable movement speed increase") stacks its own
  // percentage reduction on top of celeritas's, floored so a very high
  // dexterity can never make movement literally instant.
  private static readonly DEX_MOVE_SPEED_PERCENT_PER_POINT = 0.015;
  private static readonly MIN_MOVE_COOLDOWN_FACTOR = 0.4;

  private effectiveMoveCooldownMs(): number {
    let base = myProfile?.celeritasActive ? Math.round(MOVE_COOLDOWN_MS * 0.9) : MOVE_COOLDOWN_MS;
    // A later follow-up ask's wild-goblin drop, "boots of quickness...
    // should increase the speed at which the player moves some" — same
    // 10% cut celeritas gets, stacking multiplicatively with it if both
    // are active at once.
    if (myProfile?.equipment.boots === 'boots of quickness') base = Math.round(base * 0.9);
    // Wisp transformation (a later follow-up ask) — "move 20% faster
    // than their base (including bonuses)" — stacks multiplicatively with
    // celeritas/boots above, same as those stack with each other.
    if (myProfile?.wispActive) base = Math.round(base * WISP_MOVE_COOLDOWN_FACTOR);
    // Flight (a later follow-up ask: "increase the player's movement speed
    // similar to the speed of wisp transformation") — reuses wisp's own
    // factor exactly, stacking multiplicatively with everything above the
    // same way celeritas/boots/wisp already do with each other.
    if (myProfile?.flightActive) base = Math.round(base * FLIGHT_MOVE_COOLDOWN_FACTOR);
    // Every character starts at 1 dexterity (server/combat/formulas.ts's
    // STARTING_ATTRIBUTE) — only points ABOVE that baseline speed you up.
    const dexterity = myProfile?.dexterity ?? 1;
    const dexReduction = Math.max(0, dexterity - 1) * WorldScene.DEX_MOVE_SPEED_PERCENT_PER_POINT;
    return Math.round(base * Math.max(WorldScene.MIN_MOVE_COOLDOWN_FACTOR, 1 - dexReduction));
  }

  // Lucem/celeritas's own ack-based cast (a later follow-up ask,
  // replacing the old fire-and-forget '/lucem' chat command) — always
  // toasts the result on top of the normal combat-log line, same reason
  // as irrigo above: casting from the action bar with a modal open
  // shouldn't leave the outcome invisible.
  private castToggleSpell(cast: () => Promise<{ ok: boolean; mana?: number; skills?: Record<string, number>; message?: string }>): void {
    void cast().then((ack) => {
      // A follow-up ask (the new "must have a wand equipped" rejection,
      // but really any cast failure) wants BOTH a toast and a combat-log
      // line, not just the toast this already showed.
      if (ack.message) {
        showCenterToast(ack.message);
        logCombatMessage(ack.message);
      }
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
    // Lucem/celeritas are no-target toggles too (item 11: "the
    // player would simply click on it to either create light on the wand
    // or to remove light") — ack-based (a later follow-up ask) rather
    // than driving a chat command, so the result can be toasted even
    // with a modal open.
    if (skillName === LIGHT_SKILL) {
      this.castToggleSpell(() => this.network.castLucem());
      return;
    }
    if (skillName === HASTE_SKILL) {
      this.castToggleSpell(() => this.network.castCeleritas());
      return;
    }
    // Scutum (a later follow-up ask) is a no-target self-buff too — always
    // ON for its own fixed duration once cast (no manual toggle-off, see
    // checkScutumExpiry server-side), but reuses the exact same
    // "call the network method, patch mana/skills, refresh" mechanics
    // castToggleSpell already provides.
    if (skillName === AEGIS_SKILL) {
      this.castToggleSpell(() => this.network.castScutum());
      return;
    }
    // Murus lapideus (a later follow-up ask) targets a MAP TILE, not a
    // player/npc/monster — "the player must first click the spell and
    // then click a spot on the map." Arms murusLapideusTargeting; the
    // actual cast happens on the next left-click (see handleLeftClick).
    if (skillName === STONE_WALL_SKILL) {
      this.murusLapideusTargeting = true;
      logCombatMessage('Click a spot on the map to summon the stone block.');
      return;
    }
    // Animate dead (a later follow-up ask changed this from an
    // arm-then-click flow to the same "select first, then cast" shape
    // every other targeted spell uses) — requires a corpse already
    // selected (see setCorpseTarget, set by left-clicking a corpse
    // sprite); the server itself re-validates it's actually a MONSTER
    // corpse (not a player's) and within range.
    if (skillName === ANIMATE_DEAD_SKILL) {
      if (!this.selectedCorpseId) {
        logCombatMessage('Select a monster corpse first (left-click it).');
        return;
      }
      void this.network.castAnimateDead(this.selectedCorpseId).then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
      return;
    }
    // Recall (a later follow-up ask) opens its own destination-picker
    // modal directly — no arm-then-click flow needed, since the list of
    // valid choices is already fully known client-side (myProfile's own
    // visitedPois).
    if (skillName === RECALL_SKILL) {
      openRecallModal();
      return;
    }
    // Monster summons (a later follow-up ask) opens its own picker modal
    // directly, same "no arm-then-click flow" shape as recall above,
    // since the list of valid choices is already fully known client-side
    // (myProfile's own killedMonsterKinds).
    if (skillName === MONSTER_SUMMONS_SKILL) {
      openMonsterSummonsModal();
      return;
    }
    // Barrier (a later follow-up ask) is a no-target toggle too — casting
    // it again while active cancels it early server-side (see
    // handleCastBarrier) — NOT reusing castToggleSpell here since this
    // needs the ack's own barrierOrigin (only present on a fresh
    // successful cast) to know where to actually draw the dome.
    if (skillName === BARRIER_SKILL) {
      void this.network.castBarrier().then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
        if (!ack.ok || !myProfile) return;
        setMyProfile({ ...myProfile, mana: ack.mana ?? myProfile.mana, skills: ack.skills ?? myProfile.skills });
        this.barrierDomeOrigin = ack.barrierOrigin ?? null;
        this.updateOwnBars();
        refreshOpenModals();
      });
      return;
    }
    // Shaman's enhance damage (a later follow-up ask) is a no-target
    // self-buff too — always ON for its own fixed duration once cast (no
    // manual toggle-off, no visual), same castToggleSpell shape as scutum.
    if (skillName === SHAMAN_ENHANCE_DAMAGE_SKILL) {
      this.castToggleSpell(() => this.network.castEnhanceDamage());
      return;
    }
    // Drink/pour/irrigo (items 7, 8 & 11's follow-up asks) act on a
    // targeted INVENTORY item, not a player/npc/monster — a wholly
    // separate targeting concept (see setItemTarget, driven by clicking a
    // fillable item in the Inventory modal) from targetKind/targetId
    // below.
    if (skillName === DRINK_SKILL || skillName === POUR_SKILL || skillName === WATERFILL_SKILL) {
      this.useItemTargetedSkill(skillName);
      return;
    }
    // Resera (a later follow-up ask) targets a door or chest, not a
    // player/npc/monster — a wholly separate targeting concept (see
    // lockTarget, set by clicking a door or the chest sprite in
    // renderDoorsAndChest) from targetKind/targetId below. Stays selected
    // across repeated casts (item 6's follow-up ask) — only
    // clearLockTarget (clicking elsewhere) drops it.
    if (skillName === UNLOCK_SKILL) {
      if (!this.lockTarget) {
        logCombatMessage('Select a door or chest first (left-click it).');
        return;
      }
      void this.network.castResera(this.lockTarget).then((ack) => {
        if (ack.message) {
          logCombatMessage(ack.message);
          showCenterToast(ack.message);
        }
        if (ack.ok && myProfile && ack.skills) {
          setMyProfile({ ...myProfile, skills: ack.skills });
          refreshOpenModals();
        }
        // Re-render JUST the doors/chest (item 4's fix — NOT the whole
        // renderMap, which used to also wipe the teacher/desk/every other
        // transient sprite until the next map:state repopulated them) so
        // the chest's locked/unlocked texture reflects the freshly-
        // unlocked state immediately.
        this.renderDoorsAndChest(this.currentMap);
      });
      return;
    }

    // Lesser heal (a later follow-up ask) needs no target at all — a
    // selected PLAYER is passed along as a "friendly target" hint, but
    // the server falls back to healing the caster if there's none (or
    // the selection isn't a player, or that player turns out hostile).
    if (skillName === LESSER_HEAL_SKILL) {
      const target = this.targetKind === 'player' && this.targetId ? { targetKind: this.targetKind, targetId: this.targetId } : null;
      void this.network.castLesserHeal(target).then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
      return;
    }
    // Druid's lesser self heal (a later follow-up ask) — no target at
    // all, always heals the caster.
    if (skillName === LESSER_SELF_HEAL_SKILL) {
      void this.network.castLesserSelfHeal().then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
      return;
    }
    // Diabolist's summon demon imp (a later follow-up ask) — no target,
    // no modal, always the same fixed summon.
    if (skillName === SUMMON_DEMON_IMP_SKILL) {
      void this.network.castSummonDemonImp().then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
      return;
    }
    // Wisp transformation (a later follow-up ask) is a no-target toggle
    // too — always ON for its own fixed duration once cast (no manual
    // toggle-off, see checkWispTransformationExpiry server-side), same
    // castToggleSpell mechanics as scutum/Shaman's enhance damage.
    if (skillName === WISP_TRANSFORMATION_SKILL) {
      this.castToggleSpell(() => this.network.castWispTransformation());
      return;
    }
    // Flight (a later follow-up ask, "available to every specialization at
    // level 25") is a no-target toggle too — same castToggleSpell shape as
    // wisp above, but no manual cancel (nothing in the ask mentions one —
    // the spell just runs its own fixed 3-minute duration).
    if (skillName === FLIGHT_SKILL) {
      this.castToggleSpell(() => this.network.castFlight());
      return;
    }
    // Invisibility (a later follow-up ask) is a no-target toggle too —
    // always ON for its own fixed duration once cast, same
    // castToggleSpell mechanics as wisp above. It CAN end early (see
    // breakInvisibilityIfActive server-side), but that's a side effect
    // of attacking, not something this client needs to manage — the
    // next 'sync'/map:state simply reflects it.
    if (skillName === INVISIBILITY_SKILL) {
      this.castToggleSpell(() => this.network.castInvisibility());
      return;
    }
    // Illusionist's create duplicate (a later follow-up ask) — no
    // target, no modal, always the same fixed-stat-snapshot duplicate.
    if (skillName === CREATE_DUPLICATE_SKILL) {
      void this.network.castCreateDuplicate().then((ack) => {
        if (ack.message) {
          showCenterToast(ack.message);
          logCombatMessage(ack.message);
        }
      });
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
    // involved. A successful HIT rides the ordinary 'combat' broadcast
    // (see applyCombatEvent) same as any other attack, but a fumbled cast
    // (a later follow-up ask: augue now rolls against its own learned
    // skill percent instead of always landing) has no 'combat' event at
    // all — its ack.message is the ONLY place that text lives, so this
    // has to show it unconditionally, not just on outright rejection
    // (the old `!ack.ok &&` check silently swallowed every fumble, since
    // a fumble still comes back as `ok: true`) — same bug class already
    // fixed for stupefaciunt/exarme/murus lapideus.
    if (skillName === ARCANE_BOLT_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        void this.network.castAugue({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
      });
      return;
    }
    // The Elementalist's own 4 bolts (a later follow-up ask) — same
    // ranged, walk-into-range shape as augue above.
    if (skillName === FIRE_BOLT_SKILL || skillName === WATER_BOLT_SKILL || skillName === AIR_BOLT_SKILL || skillName === EARTH_BOLT_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      const cast =
        skillName === FIRE_BOLT_SKILL
          ? this.network.castFireBolt.bind(this.network)
          : skillName === WATER_BOLT_SKILL
            ? this.network.castWaterBolt.bind(this.network)
            : skillName === AIR_BOLT_SKILL
              ? this.network.castAirBolt.bind(this.network)
              : this.network.castEarthBolt.bind(this.network);
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        void cast({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
      });
      return;
    }
    // Battlemage's own kinetic strike (a later follow-up ask) — same
    // ranged, walk-into-range shape as augue/the elemental bolts above.
    if (skillName === KINETIC_STRIKE_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        void this.network.castKineticStrike({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
      });
      return;
    }
    // Hemomancer's own sap health (a later follow-up ask) — same ranged,
    // walk-into-range shape as augue/the elemental bolts/kinetic strike.
    if (skillName === SAP_HEALTH_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        void this.network.castSapHealth({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
      });
      return;
    }
    // Stupefaciunt/exarme (a later follow-up ask) — same ranged,
    // walk-into-range shape as augue above.
    if (skillName === STUN_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        // A follow-up bug fix: "new spells being added are not showing
        // messages" — unlike augue (whose success message rides the
        // 'combat' broadcast), stupefaciunt has no hp-bar/damage event to
        // piggyback on, so its own ack.message is the ONLY place the
        // success text lives; showing it only on failure (the old check
        // here) silently dropped every successful cast.
        void this.network.castStupefaciunt({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
      });
      return;
    }
    if (skillName === DISARM_SKILL) {
      const targetKind = this.targetKind;
      const targetId = this.targetId;
      this.tryRangedAction(targetKind, targetId, SPELL_ATTACK_RANGE_TILES, () => {
        void this.network.castExarme({ targetKind, targetId }).then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
        });
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

  // Arcane Bolt's own projectile / the wand's own ranged bolt (a follow-up
  // ask) — a small sprite tweened from the attacker's current tile to the
  // target's, rotated to face the way it's actually travelling, then
  // destroyed on arrival. No-op for any other skill (melee has no
  // projectile to animate) or if either end's position isn't resolvable
  // (e.g. the target already left the map some other way).
  private playProjectileEffect(event: CombatEventPayload): void {
    const isProjectileSkill =
      event.skill === ARCANE_BOLT_SKILL ||
      event.skill === WAND_BOLT_SKILL ||
      event.skill === FIRE_BOLT_SKILL ||
      event.skill === WATER_BOLT_SKILL ||
      event.skill === AIR_BOLT_SKILL ||
      event.skill === EARTH_BOLT_SKILL ||
      event.skill === KINETIC_STRIKE_SKILL ||
      event.skill === SAP_HEALTH_SKILL;
    if (!isProjectileSkill) return;
    const attackerPos = this.attackerPosition(event.attacker);
    if (!attackerPos) return;

    let targetSprite: Phaser.GameObjects.Sprite | undefined;
    if (event.targetKind === 'npc') targetSprite = this.npcSprites.get(event.target);
    else if (event.targetKind === 'monster') targetSprite = this.monsterSprites.get(event.target);
    else targetSprite = event.target === this.myUsername ? this.player : this.otherPlayers.get(event.target);
    if (!targetSprite) return;

    const attackerPixelPos = this.tilePosition(attackerPos.row, attackerPos.col);
    // Sap health (a later follow-up ask) — "blood flowing from the target
    // into the player": the ONE projectile here that travels in reverse
    // (target -> attacker, tinted red) rather than attacker -> target.
    const isSapHealth = event.skill === SAP_HEALTH_SKILL;
    const from = isSapHealth ? { x: targetSprite.x, y: targetSprite.y } : attackerPixelPos;
    const to = isSapHealth ? attackerPixelPos : { x: targetSprite.x, y: targetSprite.y };
    // Fire bolt reuses the fireball texture (a later follow-up ask); the
    // other 3 elemental bolts each get their own new sprite.
    let textureKey: string;
    if (event.skill === ARCANE_BOLT_SKILL) textureKey = ARCANE_BOLT_TEXTURE_KEY;
    else if (event.skill === FIRE_BOLT_SKILL) textureKey = FIREBALL_TEXTURE_KEY;
    else if (event.skill === WATER_BOLT_SKILL) textureKey = WATER_BOLT_TEXTURE_KEY;
    else if (event.skill === AIR_BOLT_SKILL) textureKey = AIR_BOLT_TEXTURE_KEY;
    else if (event.skill === EARTH_BOLT_SKILL) textureKey = EARTH_BOLT_TEXTURE_KEY;
    else textureKey = BOLT_TEXTURE_KEY;
    const projectile = this.add.sprite(from.x, from.y, textureKey).setDepth(4);
    if (isSapHealth) projectile.setTint(0xaa0000);
    projectile.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));

    const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const PROJECTILE_SPEED_PX_PER_S = 480;
    const duration = Math.max(120, (distance / PROJECTILE_SPEED_PX_PER_S) * 1000);
    this.tweens.add({
      targets: projectile,
      x: to.x,
      y: to.y,
      duration,
      onComplete: () => projectile.destroy(),
    });
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
    // A follow-up ask's projectile animations (augue's fireball, the
    // wand's own ranged bolt) — resolved from the attacker's CURRENT
    // position to the target's, so this has to run before any of the
    // cleanup below might destroy a dead target's sprite out from under
    // it.
    this.playProjectileEffect(event);

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
    // A follow-up ask: "players should not see combat messages for other
    // players that are nearby" — this combat event is broadcast to the
    // whole map/room (so hp bars/sprites update for every bystander too),
    // but the actual LOG LINE (which reads like "X hits Y for Z damage.
    // Y hits YOU back for W damage" from the fighters' own point of
    // view) is only relevant to the two people actually in it.
    if (involvesMe) logCombatMessage(event.message, logKind);
    if (event.leveledUp && event.attacker === this.myUsername) {
      // A follow-up ask: the level-up line itself should also remind the
      // player to go spend their new stat point(s), not just the separate
      // toast below (easy to miss/scroll past) — but ONLY on a level that
      // actually grants a training point (every 5th: 5, 10, 15, ...),
      // matching game.gateway.ts's own TRAINING_POINT_LEVEL_INTERVAL (a
      // server-only constant, so this literal 5 is duplicated here rather
      // than imported — same "shared/ can't import a server-only
      // constant" tradeoff several other client-side literals already make).
      const grantsTrainingPoint = event.attackerLevel % 5 === 0;
      logCombatMessage(
        `${this.myUsername} reaches level ${event.attackerLevel}!${grantsTrainingPoint ? ' Open your character sheet to allocate your stat points.' : ''}`,
        'level-up'
      );
      // A later follow-up ask replaced the old automatic per-level
      // attribute bonus with player-chosen stat points — the level-up's
      // own 'sync' (see game.gateway.ts's grantExp) already landed by now
      // (combat ticks resolve synchronously), so myProfile.statPointsAvailable
      // reflects the fresh total.
      if (myProfile?.statPointsAvailable) {
        showCenterToast(`Level up! You have ${myProfile.statPointsAvailable} stat point${myProfile.statPointsAvailable === 1 ? '' : 's'} to spend — check your character sheet.`);
      }
    }
    if (involvesMe) {
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
