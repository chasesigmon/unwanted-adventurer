// Pure rendering helpers/constants shared by WorldScene — no DOM, no
// mutable module state, just math and small Phaser Graphics drawing.
import Phaser from 'phaser';
import type { MapName, Direction } from '../../shared/constants.js';
import { FLORO_SHOP_MAPS, GRIMOAK_CASTLE_MAPS, BRAMWICK_SHOP_MAPS, KORTHO_SHOP_MAPS, GOBBLER_VILLAGE_HUT_MAPS } from '../../shared/constants.js';
import type { FacingGroup } from '../characterSprites.js';
import type { PetKind } from '../../shared/pets.js';

export const TILE_SIZE = 32;
// Classrooms (see shared/constants.ts's CLASSROOM_MAPS) are laid out at a
// third of the standard room's tile footprint (shared/maps.ts's
// CLASSROOM_ROWS/COLS) — a follow-up ask that also required they "still
// fill up the whole screen." Zooming the camera in by roughly the same
// factor the footprint shrank by restores the same on-screen coverage a
// full-size room gets at zoom 1 (see WorldScene's applyCameraBounds).
export const CLASSROOM_ZOOM = 3;
// "Make each dorm, each common room, the great hall, and the secret room
// ... fullscreen, just like how the classrooms are" (a later follow-up
// ask) — same "zoom in to restore full-screen coverage" reasoning as
// classrooms above, just computed per room family since each shrank by a
// different factor (see shared/maps.ts's own COMMON_ROOM_ROWS/COLS,
// DORM_ROOM_ROWS/COLS): min(ROOM_ROWS/theirRows, ROOM_COLS/theirCols),
// the same ROOM_ROWS/COLS(40x56) "standard room" reference frame
// CLASSROOM_ZOOM was calibrated against — taking the smaller of the two
// axis ratios keeps the whole room on screen without cropping either
// dimension. The secret room is already classroom-sized on its own (see
// CAVERNA_SECRETISSIMA's own rows/cols), so it just reuses CLASSROOM_ZOOM
// directly rather than needing its own constant.
export const COMMON_ROOM_ZOOM = 1.4;
export const DORM_ZOOM = 3.1;

// A big follow-up ask: a third zoom state — real first-person, not just a
// tighter top-down camera (see WorldScene's own enterFirstPerson/
// exitFirstPerson and its raycast render pass). Tuned to this game's
// existing chunky 32px tile art rather than a photorealistic FOV/ray
// density — see each constant's own doc comment.
// 66 degrees, the classic Wolfenstein/DOOM-era FOV — wide enough to feel
// like looking around, narrow enough that distant tiles don't warp at the
// screen edges the way a genuinely wide FOV would on flat-shaded
// (untextured) walls.
export const FP_FOV_RAD = (66 * Math.PI) / 180;
// How far (in tiles) the raycaster bothers marching/rendering — matches
// this project's other "reach" numbers (spell ranges top out around 7-10
// tiles) rather than the whole map; distance-based shading fades a wall
// toward the floor/sky color well before this, so raising it further
// wouldn't change what's actually visible, just how many empty DDA steps
// get walked past on a long open sightline.
export const FP_MAX_RENDER_DISTANCE_TILES = 20;
// One ray per this many device pixels of canvas width, not one ray per
// physical pixel — keeps the per-frame ray count in the low hundreds
// regardless of window size, and the resulting slightly-chunky vertical
// wall strips read as an intentional retro style matching the rest of
// this game's pixel art rather than a performance compromise.
export const FP_RAY_STRIDE_PX = 4;
// The angular tolerance (each side of dead-center) a billboard is still
// considered "in view" for — kept slightly wider than the raw half-FOV so
// a monster/tree just at the edge of the rendered wall strips doesn't pop
// in/out of existence one frame before its own wall backdrop would.
export const FP_BILLBOARD_FOV_PAD_RAD = (4 * Math.PI) / 180;
// Radians of look-rotation per pixel of raw Pointer-Lock `movementX` —
// tuned by feel (a full 360° turn takes a few slow mouse-pad sweeps, not
// one twitch) rather than derived from anything else in this file.
export const FP_MOUSE_LOOK_SENSITIVITY = 0.0025;
// The tile distance at which a billboarded entity renders at exactly its
// own normal top-down scale (see projectFirstPersonBillboard) — roughly
// "just outside melee range," so anything closer looms larger (as real
// perspective would) and anything farther shrinks, rather than every
// entity rendering flatly at one fixed size regardless of distance like
// the ordinary top-down view does today.
// Bug fix: a follow-up report ("monsters & NPCs should appear a little
// closer... compared to now" + "the shopkeeper appeared really far away")
// found 1.5 read as too small/distant at ordinary conversation/shop-
// counter range — bumped so a nearby NPC/monster fills a more believable
// share of the screen without needing melee-range closeness first.
export const FP_BILLBOARD_REFERENCE_DISTANCE_TILES = 2.75;
// Caps how large a billboard is ever allowed to render (as a multiple of
// its own normal top-down scale) — without this, an entity standing
// right next to the player (perpDistance approaching 0) would blow up
// toward infinite scale.
export const FP_BILLBOARD_MAX_SCALE_MULTIPLIER = 3.5;
// Bug fix: sampling the wall pass's per-column distance at the entity's
// own EXACT column (a single ray) caused nearby monsters/NPCs to flicker
// in and out of view as they walked (a slightly different column landing
// on/off a wall-adjacent tile edge frame to frame) and made anything just
// past a tree/wall corner vanish outright even when clearly visible past
// it. Sampling a small spread of neighboring columns and using the
// FARTHEST of them (most lenient) smooths both problems out — a real
// wall still reliably occludes (every column across its own width agrees
// it's there), but a single grazing corner no longer flickers an entity
// behind it in and out of existence.
export const FP_OCCLUSION_COLUMN_SPREAD = 3;
// A small forgiveness margin on top of the sampled wall distance itself —
// an entity standing essentially AT a doorway/wall-edge shouldn't pop out
// of view from one pixel of parallax error in the distance sampling.
export const FP_OCCLUSION_MARGIN_TILES = 0.5;
// How far (in device pixels) the horizon/billboards can shift for "look
// up/down" (a follow-up ask) — this is a 2.5D raycaster with no real
// vertical geometry, so pitch is the classic "shift the horizon line and
// clip" trick rather than true 3D, same honest "for now" tradeoff as the
// flat-shaded (untextured) walls. Clamped well short of the full screen
// half-height so the illusion never inverts on itself.
export const FP_MAX_PITCH_OFFSET_PX = 220;
// Radians... no, PIXELS of vertical Pointer-Lock movementY per pixel of
// pitch offset — 1:1 feels the most direct/natural for a "look up/down"
// drag, unlike yaw (which needs its own radians-per-pixel conversion
// since it's an angle, not a screen offset).
export const FP_PITCH_SENSITIVITY = 1;

export const TREE_TEXTURE_KEY = 'tree';
// Silverbranch Road's own trees (a later follow-up ask: "trees on the
// grass with silver branches... to match the naming theme of the road")
// — a distinct sprite, same tree system otherwise (see shared/trees.ts).
export const SILVER_TREE_TEXTURE_KEY = 'silver-tree';
// Direfell's own bare, gnarled trees (a later follow-up ask: "a haunted
// looking forest") — same tree system, its own distinct sprite.
export const SPOOKY_TREE_TEXTURE_KEY = 'spooky-tree';
export const DAGGER_TEXTURE_KEY = 'held-dagger';
// The training skeletons' own practice weapon (a follow-up ask) — same
// "small held-item overlay" shape as the dagger, its own texture/asset
// since it's a visually distinct weapon, not a reskin.
export const CLUB_TEXTURE_KEY = 'held-club';
export const BONE_SHIELD_TEXTURE_KEY = 'held-bone-shield';
export const TORCH_HELD_TEXTURE_KEY = 'held-torch';
// A wand, held in the same hand/position as a dagger (mutually
// exclusive — see shared/equipment.ts's WAND_ITEM) — its own overlay
// sprite rather than reusing the dagger one, same "shares a slot, still
// a distinct held item" shape as the torch/shield pairing.
export const WAND_TEXTURE_KEY = 'held-wand';
// The small glow effect at the wand's tip while lucem is active (item
// 12) — a plain Phaser Graphics-drawn circle (see WorldScene's
// wandGlowSprite), not a sprite asset, same "Graphics for a lighting
// effect" treatment the hp/mana bars already use, rather than pre-baked
// pixel art for something that's a soft radial blur by nature.
export const WAND_GLOW_RADIUS_PX = 7;
export const WAND_GLOW_COLOR = 0xfff2b0;

// Bramwick's own 4 shop cottages (a later follow-up ask: "create cottage
// buildings... a sign over each building for the name of it") — one
// frame per shop with its own baked-in name plaque, in BRAMWICK_SHOP_MAPS
// order. Every Bramwick shop door faces the same way (`direction:
// 'north'`, see shared/maps.ts's bramwickShopDoorExits), so unlike
// Floro's mirrored pair this only ever needs the one orientation.
export const BRAMWICK_COTTAGE_TEXTURE_KEY = 'bramwick-cottage';
// Doubled (a later follow-up ask) — the door is drawn touching the very
// bottom edge of the frame now, so the sprite can be anchored directly
// at the shop's own real MapExit tile (see WorldScene's own cottage
// positioning) and "walking into the shop spritesheet's door" IS walking
// onto that tile — no separate door sprite needed anymore (see
// shared/maps.ts's bramwickShopDoorExits, now `kind: 'open'`).
export const BRAMWICK_COTTAGE_FRAME_WIDTH = 192;
export const BRAMWICK_COTTAGE_FRAME_HEIGHT = 256;

// Kortho's own 7 shop buildings (a later follow-up ask: "modern medieval
// shops that would belong in that stone age town... put the name of the
// shop at the top of each") — same "one frame per shop, door touching the
// frame's own bottom edge, no separate door sprite" shape as Bramwick's
// cottages above (see tools/gen-kortho-shop-assets.mjs), one frame per
// KORTHO_SHOP_MAPS entry in that exact order. A stone-block wall (not
// Floro's timber-plaster or Bramwick's own look) with a wooden name
// banner near the roofline, rendered with real PIL text rather than a
// coarse pixel font.
export const KORTHO_SHOP_TEXTURE_KEY = 'kortho-shop';
export const KORTHO_SHOP_FRAME_WIDTH = 192;
export const KORTHO_SHOP_FRAME_HEIGHT = 256;

// Gobbler Village's own 3 huts (a later follow-up ask: "make it like a
// small village structure with huts to go into") — same "one frame per
// door, touching the frame's own bottom edge, no separate door sprite"
// shape as Bramwick/Kortho above (see tools/gen-gobbler-hut-assets.mjs),
// one frame per GOBBLER_VILLAGE_HUT_MAPS entry in that exact order.
// Deliberately smaller/cruder than the town buildings above (log walls,
// conical thatch roof, no name banner) to read as a primitive village.
export const GOBBLER_HUT_TEXTURE_KEY = 'gobbler-hut';
export const GOBBLER_HUT_FRAME_WIDTH = 128;
export const GOBBLER_HUT_FRAME_HEIGHT = 160;

// The small canoe/large raft (a later follow-up ask) — each a 4-frame
// spritesheet, one frame per facing in the same down/up/left/right row
// order src/characterSprites.ts's own ROW_INDEX uses, so
// `ROW_INDEX[facing]` doubles as the frame index here too (see
// tools/gen-boat-assets.mjs).
export const CANOE_TEXTURE_KEY = 'canoe';
export const RAFT_TEXTURE_KEY = 'raft';
// A later follow-up ask: "update the canoe graphic to be a little longer
// and wider" — its own bigger frame now (see tools/gen-boat-assets.mjs's
// own CANOE_FRAME), distinct from the raft's own BOAT_FRAME_SIZE.
export const CANOE_FRAME_SIZE = 64;
export const BOAT_FRAME_SIZE = 48;

// The Hexstone Cavern cave-mouth entrance (a later follow-up ask:
// "a nice looking cave sprite entrance... there should not be a door")
// — a single static image (see tools/gen-cave-entrance.mjs), reused at
// both ends of the connection (Great Plains' own side and Hexstone
// Cavern's own side); the dark opening touches the frame's own bottom
// edge, same "walk into the sprite's own door, no separate door sprite"
// convention every other structure sprite here already uses.
export const CAVE_ENTRANCE_TEXTURE_KEY = 'cave-entrance';

// A single fancy double door (a follow-up ask) used for EVERY map exit
// now — shop doors and every other transition alike — replacing both the
// old plain 'door' SVG and the shop-only wooden-door spritesheet (which
// used to be the only distinction between the two). See
// tools/gen-grand-door.mjs.
export const GRAND_DOOR_TEXTURE_KEY = 'grand-door';

// Grimoak Castle's exterior (item 4) and its decorations (item 6) — real
// static PNGs generated by tools/gen-castle-exterior.mjs (no Aseprite/
// pixel-mcp available in this environment). The castle is one wide image:
// a central keep + 2 (original) towers, flanked by 2 more wings and 1
// more outer tower per side (item 2's correction — the width grew by
// adding distinct buildings, not by stretching the original artwork;
// ROWS/height is unchanged from the original single-keep image). Flight/
// flicker motion comes from Phaser tweens applied to these otherwise-
// static textures, not frame animation — the same treatment this
// project's wall torches already use.
export const CASTLE_EXTERIOR_TEXTURE_KEY = 'castle-exterior';
export const CASTLE_EXTERIOR_WIDTH = 1920;
export const CASTLE_EXTERIOR_HEIGHT = 672;
// Halved again per a follow-up request ("keep the same number of
// buildings/towers, but make it half the size") — same wide asset above,
// just rendered smaller. shared/maps.ts's own castle-collision footprint
// (see isCastleExteriorBlocked) is expressed in these same already-scaled
// tile dimensions.
export const CASTLE_EXTERIOR_SCALE = 1;
// Each of the 4 towers' horizontal center, as a fraction of the whole
// image's width — left outer, left inner, right inner, right outer, in
// that order, computed from tools/gen-castle-exterior.mjs's own layout
// math so a crow can be anchored at the top of every tower (a follow-up
// ask), not just two fixed points sized for the old 2-tower design.
export const CASTLE_TOWER_X_FRACTIONS = [0.03125, 0.284375, 0.715625, 0.96875];
// How far down from the image's top edge a crow should hover — just
// below the spire tips, same proportion the original 2-tower design used.
export const CASTLE_TOWER_TOP_FRACTION = 0.06;
export const CROW_TEXTURE_KEY = 'crow';
export const FIREPLACE_MANTLE_TEXTURE_KEY = 'fireplace-mantle';
export const FIREPLACE_FLAME_TEXTURE_KEY = 'fireplace-flame';
export const STAIRS_TEXTURE_KEY = 'stairs';
// Classroom door symbols (a follow-up ask) — a small icon above each
// classroom's own door in the Entrance Hall, showing what subject it
// teaches at a glance.
export const CLASSROOM_SYMBOL_TEXTURE_KEYS: Partial<Record<MapName, string>> = {
  // Still the flame icon (a later follow-up ask renamed the room itself
  // to "Specialization" and dropped it from CLASSROOM_MAPS, but a door
  // symbol is purely decorative — no reason to redraw it).
  Specialization: 'classroom-symbol-elemental',
  'Defense Classroom': 'classroom-symbol-defense',
  'Utility Classroom': 'classroom-symbol-utility',
  'Offense Classroom': 'classroom-symbol-offense',
};
// A classroom teacher's desk (a follow-up ask) — furniture, not a
// separate server entity; positioned from server/worlds/teachers.ts's
// deskPositionFor, always one tile in front of its teacher.
export const CLASSROOM_DESK_TEXTURE_KEY = 'classroom-desk';
// A shop counter (a later follow-up ask: "make the desks wider, but not
// as tall" — a dedicated shape, not a stretched classroom-desk) every
// Floro/Kortho vendor stands behind now (see tools/gen-shop-counter-
// asset.mjs); positioned the same "one tile in front of" convention as
// the classroom desk above, see server/worlds/vendors.ts's
// vendorCounterFootprintFor for its real (wider, shorter) collision
// footprint.
export const SHOP_COUNTER_TEXTURE_KEY = 'shop-counter';
export const SHOP_COUNTER_WIDTH = 160;
export const SHOP_COUNTER_HEIGHT = 44;
// A social gathering spot's benches (a follow-up ask upgraded these from
// plain chairs) — see shared/lighting.ts's benchPositionsFor.
export const BENCH_TEXTURE_KEY = 'bench';
// A later follow-up ask: "Add a 'Crafting Shop'... create a crafting
// table" — see shared/lighting.ts's craftingTablePositionFor.
export const CRAFTING_TABLE_TEXTURE_KEY = 'crafting-table';
// Spell/attack projectiles (a follow-up ask) — see WorldScene's
// playProjectileEffect, triggered off a 'combat' event's own `skill`.
export const FIREBALL_TEXTURE_KEY = 'fireball';
export const BOLT_TEXTURE_KEY = 'bolt';
// Arcane Bolt's own projectile (a later follow-up ask renamed augue and
// gave it a distinct light-blue sprite instead of reusing the fireball
// texture — the fireball animation is reserved for the Elementalist's fire
// bolt spell instead).
export const ARCANE_BOLT_TEXTURE_KEY = 'arcane-bolt';
// The Elementalist's own water/air/earth bolts (a later follow-up ask) —
// fire bolt reuses FIREBALL_TEXTURE_KEY above per the same ask, these 3
// get their own new sprites.
export const WATER_BOLT_TEXTURE_KEY = 'water-bolt';
export const AIR_BOLT_TEXTURE_KEY = 'air-bolt';
export const EARTH_BOLT_TEXTURE_KEY = 'earth-bolt';
// Druid's wisp transformation (a later follow-up ask) — a 6-frame
// shimmering-orb spritesheet (24x24 per frame), replacing the caster's
// own character sprite entirely while active — see WorldScene's
// updateWispVisual.
export const WISP_TEXTURE_KEY = 'wisp';
export const WISP_FRAME_SIZE = 24;
export const WISP_ANIM_KEY = 'wisp-shimmer';
// The secret room's treasure chest (a later follow-up ask) — two frames
// picked by the player's own secretChestUnlocked flag, see
// shared/maps.ts's CAVERNA_CHEST_POSITION.
export const CHEST_LOCKED_TEXTURE_KEY = 'chest-locked';
export const CHEST_UNLOCKED_TEXTURE_KEY = 'chest-unlocked';
// Murus lapideus's own summoned stone block (a later follow-up ask) —
// see WorldScene's stoneBlockSprites.
export const STONE_BLOCK_TEXTURE_KEY = 'stone-block';
// A later follow-up ask: "don't re-use the stone wall sprite for the
// Labyrinth, create a new slimmer looking wall with brick construction" —
// STONE_BLOCK_TEXTURE_KEY above is actually Murus Lapideus's own summoned
// creature sprite (it has a face), never meant to be a plain wall; the
// Labyrinth's maze walls (see WorldScene's labyrinthWallSprites) get their
// own purpose-built texture instead.
export const LABYRINTH_WALL_TEXTURE_KEY = 'labyrinth-brick-wall';
// A Dorms room's own beds (a later follow-up ask) — see
// shared/lighting.ts's bedPositionsFor.
export const BED_TEXTURE_KEY = 'bed';
// The Great Hall's own long banquet table, dining/stage chairs, and
// faculty stage (a follow-up ask) — see shared/lighting.ts's
// greatHallTableFootprint/greatHallChairPositionsFor/greatHallStagePlatform.
// The Grimoak Grounds' own castle gate (a follow-up ask) — a single leaf
// texture, the right-hand leaf just being the same texture flipped (see
// WorldScene's own rendering) — see shared/maps.ts's isGateTile/GATE_ROW.
export const CASTLE_GATE_LEAF_TEXTURE_KEY = 'castle-gate-leaf';
// Matches gen-castle-gate.mjs's own COLS(20) * CELL(4) exactly — half the
// gate's own 5-tile-wide span, so the two leaves meet edge-to-edge with
// no gap when closed.
export const CASTLE_GATE_LEAF_WIDTH_PX = 80;
export const LONG_TABLE_TEXTURE_KEY = 'long-table';
export const HALL_CHAIR_TEXTURE_KEY = 'hall-chair';
export const HEAD_CHAIR_TEXTURE_KEY = 'head-chair';
export const GREAT_HALL_STAGE_TEXTURE_KEY = 'great-hall-stage';
// The castle's 4th floor own 4 decorative "swirling light blue" portals
// (a later follow-up ask) — see shared/lighting.ts's portalPositionsFor.
export const PORTAL_TEXTURE_KEY = 'portal';
// The flight spell's own ground-hugging cloud (a later follow-up ask:
// "put a small cloudy looking sphere under the character's feet... it
// should be swirling like the portals and be cloudy") — same tween-driven
// rotation convention as PORTAL_TEXTURE_KEY above, just a soft wispy puff
// instead of a hard-edged spiral.
export const FLIGHT_CLOUD_TEXTURE_KEY = 'flight-cloud';
// How far below the character sprite's own anchor the cloud sits — a
// positive y offset (down), roughly symmetric with HP_BAR_OFFSET_Y's own
// upward offset, landing it at the character's visual feet rather than
// their waist/head.
export const FLIGHT_CLOUD_FEET_OFFSET_Y = 20;
// Bramwick's own clickable name sign (a later follow-up ask) — see
// shared/lighting.ts's BRAMWICK_SIGN_POSITION.
export const SIGN_TEXTURE_KEY = 'sign';
// Grimoak Grounds' own dirt-road patch leading up to Bramwick's entrance
// (a later follow-up ask) — a distinct tile from Bramwick's own 'dirt'
// street texture above (see shared/maps.ts's GRIMOAK_GROUNDS_ROAD_ROWS/
// GRIMOAK_GROUNDS_ROAD_HALF_WIDTH_TILES), drawn as a TileSprite overlay
// on top of the Grounds' base grass, same technique as the moat/bridge.
export const DIRT_ROAD_TEXTURE_KEY = 'dirt-road';
// Bramwick's own 9 freestanding street torches (a later follow-up ask) —
// 2 frames (0: unlit by day, 1: lit at night, see WorldScene's own
// handleWorldTime), see shared/lighting.ts's standingTorchPositionsFor.
export const STANDING_TORCH_TEXTURE_KEY = 'standing-torch';
export const STANDING_TORCH_FRAME_WIDTH = 16;
export const STANDING_TORCH_FRAME_HEIGHT = 32;
export const STANDING_TORCH_UNLIT_FRAME = 0;
export const STANDING_TORCH_LIT_FRAME = 1;

// The quest status icon floating over a quest-giver's own head (a later
// follow-up ask) — 3 frames, see shared/quests.ts's QuestIconState for
// what each means.
export const QUEST_ICON_TEXTURE_KEY = 'quest-icon';
export const QUEST_ICON_FRAME_WIDTH = 20;
export const QUEST_ICON_FRAME_HEIGHT = 20;
export const QUEST_ICON_NOT_STARTED_FRAME = 0;
export const QUEST_ICON_READY_FRAME = 1;
export const QUEST_ICON_IN_PROGRESS_FRAME = 2;

// A player's own companion pet (a later follow-up ask) — one small
// 2-frame (idle bob) spritesheet per kind, generated via Python/PIL same
// as every other new sprite this session, rather than the full
// multi-direction walk-cycle sheet a real character/monster uses (see
// characterSprites.ts) — a much lighter-weight "creature", not a whole
// new playable race.
// Item 15's own 3 new Kortho-only pets — same 24x24 2-frame shape as the
// original 3 (their own evolved forms are covered by PET_EVOLVED_TEXTURE_KEYS
// below now too, see its own doc comment).
export const PET_TEXTURE_KEYS: Record<PetKind, string> = {
  puppy: 'pet-puppy',
  kitten: 'pet-kitten',
  piglet: 'pet-piglet',
  griffin: 'pet-griffin',
  elemental: 'pet-elemental',
  phoenix: 'pet-phoenix',
  lion: 'pet-lion',
  tiger: 'pet-tiger',
  panther: 'pet-panther',
  cougar: 'pet-cougar',
  cheetah: 'pet-cheetah',
  jaguar: 'pet-jaguar',
  leopard: 'pet-leopard',
};
export const PET_FRAME_WIDTH = 24;
export const PET_FRAME_HEIGHT = 24;

// A pet's own evolved form (a later follow-up ask: "create a sprite that
// is slightly larger and modelled differently for each respective pet"
// — evolution previously just renamed the pet and reused its un-evolved
// spritesheet, see PET_EVOLUTION_LEVEL's own doc comment). Real, distinct
// art per kind (see tools/gen-pet-evolved-assets.mjs for puppy/kitten/
// piglet, tools/gen-flying-pet-evolved-assets.mjs for the later griffin/
// elemental/phoenix ask) at a bigger frame size — WorldScene picks
// between these and PET_TEXTURE_KEYS above by comparing a pet's own
// `name` against PET_EVOLVED_NAME. Now a full PetKind record (a later
// follow-up ask, "young griffin→griffin, young phoenix→phoenix, evolve
// into 'elemental'", extended this beyond the original 3 kinds) — the
// evolved form's own NAME collides with the base kind's key itself for
// these 3 (unlike dog/cat/boar, whose names differ from puppy/kitten/
// piglet), hence the '-evolved' texture-key suffix to keep them distinct
// from PET_TEXTURE_KEYS' own 'pet-griffin'/'pet-elemental'/'pet-phoenix'.
export const PET_EVOLVED_TEXTURE_KEYS: Record<PetKind, string> = {
  puppy: 'pet-dog',
  kitten: 'pet-cat',
  piglet: 'pet-boar',
  griffin: 'pet-griffin-evolved',
  elemental: 'pet-elemental-evolved',
  phoenix: 'pet-phoenix-evolved',
  lion: 'pet-lion-evolved',
  tiger: 'pet-tiger-evolved',
  panther: 'pet-panther-evolved',
  cougar: 'pet-cougar-evolved',
  cheetah: 'pet-cheetah-evolved',
  jaguar: 'pet-jaguar-evolved',
  leopard: 'pet-leopard-evolved',
};
export const PET_EVOLVED_FRAME_WIDTH = 32;
export const PET_EVOLVED_FRAME_HEIGHT = 32;

export const CHAR_SCALE = 0.275;
export const CORPSE_SCALE = 0.35;
// One server round trip per tile-step, throttled the same way holding a
// key down is throttled everywhere else in this project — the walk
// animation plays for exactly this long while tweening between tiles, so
// it reads as a step, not a teleport.
export const MOVE_COOLDOWN_MS = 220;
// Other players/monsters only report a NEW position every so often (see
// the server's own wander/broadcast tick) — tweening the visible step
// over this much shorter duration is what turns "teleports" into "walks".
export const REMOTE_STEP_TWEEN_MS = 260;

export const HP_BAR_WIDTH = 40;
export const HP_BAR_HEIGHT = 5;
export const HP_BAR_OFFSET_Y = -25;
export const MANA_BAR_COLOR = 0x4a8fd4;
export const BAR_STACK_GAP = 2;

// A hand-rolled inline SVG cursor rather than an image asset — a small
// enough shape that hand-authored SVG is clearer than a sprite round-trip.
// Hotspot (12, 12) sits on the blade so the tip visually points at
// whatever's under the cursor.
const SWORD_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <g transform="rotate(45 12 12)">
    <rect x="10.5" y="1" width="3" height="13" rx="0.5" fill="#e4e4e4" stroke="#2a2a2a" stroke-width="0.75"/>
    <rect x="11.4" y="1" width="1.2" height="13" fill="#ffffff" opacity="0.6"/>
    <rect x="7" y="14" width="10" height="2.4" rx="0.6" fill="#8a6a3a" stroke="#2a2a2a" stroke-width="0.5"/>
    <rect x="10.3" y="16.4" width="3.4" height="6.2" rx="1" fill="#5a4020" stroke="#2a2a2a" stroke-width="0.5"/>
  </g>
</svg>`;
export const SWORD_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SWORD_CURSOR_SVG)}") 12 12, pointer`;

// A quill-feather cursor for the spellbook podium — same hand-rolled
// inline SVG treatment as the sword cursor above.
const FEATHER_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <g transform="rotate(35 12 12)">
    <path d="M12 1 C17 3.5 17 12.5 12 15 C7 12.5 7 3.5 12 1 Z" fill="#f2ecd8" stroke="#8a8060" stroke-width="0.6"/>
    <path d="M12 2 L12 15" stroke="#c9a24a" stroke-width="0.6"/>
    <path d="M12 2 L9 5 M12 4.5 L9 7.5 M12 7 L9.5 10 M12 9.5 L10 12" stroke="#c9a24a" stroke-width="0.4" opacity="0.7"/>
    <rect x="11.3" y="15" width="1.4" height="7" rx="0.5" fill="#5a4020" stroke="#2a2a2a" stroke-width="0.4"/>
  </g>
</svg>`;
export const FEATHER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(FEATHER_CURSOR_SVG)}") 12 12, pointer`;

// A brass key cursor for doors/the treasure chest (a later follow-up
// ask) — same hand-rolled inline SVG treatment as the sword/feather
// cursors above, shown while hovering anything resera-targetable.
const KEY_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <g transform="rotate(-35 12 12)">
    <circle cx="7" cy="7" r="4.2" fill="none" stroke="#d4af37" stroke-width="2.2"/>
    <circle cx="7" cy="7" r="1.4" fill="#2a2a2a"/>
    <rect x="9.8" y="6.1" width="10" height="1.8" rx="0.4" fill="#d4af37"/>
    <rect x="15.5" y="7.9" width="1.8" height="2.6" fill="#d4af37"/>
    <rect x="18" y="7.9" width="1.8" height="3.6" fill="#d4af37"/>
  </g>
</svg>`;
export const KEY_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(KEY_CURSOR_SVG)}") 12 12, pointer`;

// A "zZz" sleep cursor for the Dorms rooms' own beds (a later follow-up
// ask) — three drowsy stacked z's, same hand-rolled inline SVG treatment
// as the cursors above.
const SLEEP_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <text x="1" y="10" font-family="sans-serif" font-size="7" font-weight="bold" fill="#bcd7ff" stroke="#1a2a40" stroke-width="0.5">z</text>
  <text x="7" y="16" font-family="sans-serif" font-size="9" font-weight="bold" fill="#bcd7ff" stroke="#1a2a40" stroke-width="0.5">Z</text>
  <text x="14" y="22" font-family="sans-serif" font-size="7" font-weight="bold" fill="#bcd7ff" stroke="#1a2a40" stroke-width="0.5">z</text>
</svg>`;
export const SLEEP_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SLEEP_CURSOR_SVG)}") 12 12, pointer`;

// Facing IS the sheet's own row now — down/up/left/right are each real,
// fully distinct frames (see characterSprites.ts), not a 3-row sheet with
// a flipped "side" shared between left and right.
export type Facing = FacingGroup;

export function floorTextureFor(mapName: MapName): string {
  if (mapName === 'Labyrinth' || (GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return 'stone';
  if (mapName === 'Floro' || mapName === 'Kortho') return 'concrete';
  // Floro's and Kortho's own shop interiors (a later follow-up ask: "make
  // it a different stone texture inside that on the outside, remove the
  // grass" — KORTHO_SHOP_MAPS was previously missing from this function
  // entirely, silently falling through to the plain 'grass' default
  // below) — same 'stone' interior Bramwick's shops/the castle already
  // use, distinct from either town's own 'concrete' street.
  if ((FLORO_SHOP_MAPS as readonly string[]).includes(mapName) || (KORTHO_SHOP_MAPS as readonly string[]).includes(mapName)) return 'stone';
  // Bramwick's own shop cottages (a later follow-up ask) get the same
  // stone interior as Floro's/Kortho's shops above; the village street
  // itself is the "dirt road" the entrance north of Grimoak Grounds
  // leads into.
  if ((BRAMWICK_SHOP_MAPS as readonly string[]).includes(mapName)) return 'stone';
  if (mapName === 'Bramwick') return 'dirt';
  // A later follow-up ask: "it should have grass, but make the grass
  // slightly darker than in Grimoak Grounds" — a distinct, slightly
  // darker variant of the same grass tile (see assets/dark-grass-tile.svg).
  if (mapName === 'Mystical Timberland') return 'dark-grass';
  // A later follow-up ask: "make this world have a dirt background with
  // the same texture as in Bramwick" — same 'dirt' street Bramwick's own
  // village square uses. Its own huts get the same treatment inside too,
  // a rustic dirt floor rather than the stone Floro/Kortho/Bramwick's
  // own SHOPS use.
  if (mapName === 'Gobbler Village' || (GOBBLER_VILLAGE_HUT_MAPS as readonly string[]).includes(mapName)) return 'dirt';
  // A later follow-up ask: "make it have a cave texture" — Hexstone
  // Cavern's own rocky floor, reused as-is for Brimstone Cave.
  if (mapName === 'Hexstone Cavern' || mapName === 'Brimstone Cave') return 'cave';
  // A later follow-up ask: "instead of the grass on either side, create
  // boulders and rocks and impassable looking terrain" — Runestone Way's
  // own off-road ground (the walkable band itself is still the usual
  // dirt-road overlay, see WorldScene's own renderMap).
  if (mapName === 'Runestone Way') return 'boulder-field';
  // A later follow-up ask: "make it look like a canyon" — the same rocky
  // boulder-field ground Runestone Way already uses reads as the canyon's
  // own rim/high ground; the deeper canyon floor gets its own darker
  // overlay tileSprite instead (see WorldScene's own renderMap).
  if (mapName === 'Runestone Canyon') return 'boulder-field';
  // A later follow-up ask: "the new world Direfell... its texture/
  // background should be a haunted looking forest."
  if (mapName === 'Direfell') return 'haunted-forest';
  return 'grass';
}

export function facingForDirection(direction: Direction): Facing {
  if (direction === 'north') return 'up';
  if (direction === 'south') return 'down';
  return direction === 'west' ? 'left' : 'right';
}

// The canoe/raft spritesheets' own frame order (see tools/gen-boat-
// assets.mjs) — matches src/characterSprites.ts's ROW_INDEX exactly, so a
// boat always faces the same way its rider does.
export const BOAT_FRAME_FOR_FACING: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };

export function drawStatBar(bar: Phaser.GameObjects.Graphics, ratio: number, color: number): void {
  bar.clear();
  bar.fillStyle(0x000000, 0.55);
  bar.fillRect(-HP_BAR_WIDTH / 2, 0, HP_BAR_WIDTH, HP_BAR_HEIGHT);
  bar.fillStyle(color, 1);
  bar.fillRect(-HP_BAR_WIDTH / 2 + 1, 1, Math.max(0, (HP_BAR_WIDTH - 2) * ratio), HP_BAR_HEIGHT - 2);
}

export function drawHpBar(bar: Phaser.GameObjects.Graphics, hp: number, maxHp: number): void {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const color = ratio > 0.5 ? 0x3ecf5e : ratio > 0.25 ? 0xd9a53c : 0xd9403c;
  drawStatBar(bar, ratio, color);
}

// ---------- First-person raycasting (a big follow-up ask: "make another
// zoom option that takes the player into first person... everything
// should be to scale") — a real Wolfenstein/DOOM-style raycaster, the only
// way to get genuine distance-based scale out of this game's otherwise
// 100% flat top-down rendering. All positions here are in TILE units
// (row/col, fractional), not pixels — WorldScene's own first-person
// update pass converts its sprites' pixel x/y by dividing by TILE_SIZE
// before calling into any of this. Angles are radians, with angle 0
// pointing toward -row (screen "north") and increasing clockwise toward
// +col (screen "east") — i.e. direction vector (sin(angle), -cos(angle))
// — chosen so it matches atan2(dCol, -dRow) directly with no conversion,
// the same convention shared/aiming.ts's own isAimedAtTarget uses for the
// server-side "is the player's wand actually pointed at this" check, so
// the two can never drift apart from using different angle conventions.
import { wallHitKindAt, type WallHit } from '../../shared/raycastWalls.js';

const FP_WALL_COLOR_BY_KIND: Record<Exclude<WallHit['kind'], 'none'>, number> = {
  tree: 0x2f4d2a,
  castleWall: 0x6b6b76,
  shopWall: 0x7a5c3e,
  moat: 0x2f5468,
  labyrinth: 0x3a3a42,
};
// Distant walls darken toward the floor color rather than all the way to
// black, so the far end of a long sightline still reads as "wall," not a
// void.
const FP_MIN_WALL_BRIGHTNESS = 0.25;

// A follow-up ask: "in any area considered outside there should be a blue
// sky above, in shops a stone texture, in the castle what they use
// respectively, in caves a cave texture" — the ceiling/ "sky" half of the
// view is a flat color keyed off which of these 4 broad categories the
// CURRENT map falls into (no per-map ceiling texture exists to sample, so
// this is the same "a real distinguishing flat color, not a texture" v1
// tradeoff the wall pass itself already makes).
export type FirstPersonEnvironment = 'outside' | 'cave' | 'castle' | 'indoor';

const FP_CAVE_MAPS: readonly MapName[] = ['Hexstone Cavern', 'Brimstone Cave'];
const FP_INDOOR_SHOP_MAPS: readonly MapName[] = [
  ...FLORO_SHOP_MAPS,
  ...KORTHO_SHOP_MAPS,
  ...BRAMWICK_SHOP_MAPS,
  ...GOBBLER_VILLAGE_HUT_MAPS,
];

export function firstPersonEnvironmentFor(mapName: MapName): FirstPersonEnvironment {
  if ((GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName)) return 'castle';
  if (FP_CAVE_MAPS.includes(mapName)) return 'cave';
  if (FP_INDOOR_SHOP_MAPS.includes(mapName)) return 'indoor';
  return 'outside';
}

const FP_SKY_COLOR_BY_ENV: Record<FirstPersonEnvironment, number> = {
  outside: 0x5b8fd9, // a real blue sky, not the dim night-tinted navy this used to always show
  cave: 0x241f1a, // near-black rock ceiling
  castle: 0x4c4d57, // grey castle stonework, matching floorTextureFor's own 'stone'
  indoor: 0x5a4630, // warm timber/stone shop-interior ceiling
};

export function firstPersonSkyColorFor(environment: FirstPersonEnvironment): number {
  return FP_SKY_COLOR_BY_ENV[environment];
}

// A follow-up ask: "the ground... is all the same, it doesn't match the
// grass or stone textures" — reuses floorTextureFor's OWN per-map texture
// key (the exact same one the ordinary top-down floor tile already uses)
// rather than a second, separately-maintained map classification, so the
// two can never disagree about what a given map's ground is supposed to
// look like. Still a flat representative color per key (no true texture
// sampling in the raycaster yet), but now it actually varies map to map.
const FP_FLOOR_COLOR_BY_TEXTURE: Record<string, number> = {
  grass: 0x3a6b2f,
  'dark-grass': 0x2c5324,
  stone: 0x55555f,
  concrete: 0x5c5c5c,
  dirt: 0x5a4632,
  cave: 0x3a3226,
  'boulder-field': 0x4a473f,
  'haunted-forest': 0x2a2f26,
};
const FP_DEFAULT_FLOOR_COLOR = FP_FLOOR_COLOR_BY_TEXTURE.grass!;

export function firstPersonFloorColorFor(floorTexture: string): number {
  return FP_FLOOR_COLOR_BY_TEXTURE[floorTexture] ?? FP_DEFAULT_FLOOR_COLOR;
}

export interface FirstPersonColumnHit {
  perpDistance: number;
  kind: WallHit['kind'];
  // Which pair of grid lines this ray actually crossed to register its hit
  // (a column-step vs a row-step in the DDA march) — used purely to shade
  // one orientation of wall face a touch darker than the other, the
  // classic cheap raycaster trick that makes adjacent walls at right
  // angles read as distinct surfaces instead of one flat mass.
  side: 0 | 1;
}

// One ray, marched cell-to-cell via DDA (digital differential analysis) —
// the standard, numerically exact way to raycast against an integer tile
// grid (no fixed-step marching, so no risk of stepping clean over a
// 1-tile-thin wall at a shallow angle). `wallHitKindAt` (shared/
// raycastWalls.ts) is the exact same static-obstacle check
// shared/lineOfSight.ts's own hasLineOfSight already uses for combat LOS —
// deliberately reused rather than reimplemented, so "what a player can see
// through" and "what a player can walk through" can never silently drift
// apart from each other.
function castFirstPersonRay(
  mapName: MapName,
  originCol: number,
  originRow: number,
  angle: number,
  maxDistanceTiles: number
): { distance: number; kind: WallHit['kind']; side: 0 | 1 } {
  const dirCol = Math.sin(angle);
  const dirRow = -Math.cos(angle);
  let mapCol = Math.floor(originCol);
  let mapRow = Math.floor(originRow);
  const deltaDistCol = dirCol === 0 ? Infinity : Math.abs(1 / dirCol);
  const deltaDistRow = dirRow === 0 ? Infinity : Math.abs(1 / dirRow);
  let stepCol: number;
  let stepRow: number;
  let sideDistCol: number;
  let sideDistRow: number;
  if (dirCol < 0) {
    stepCol = -1;
    sideDistCol = (originCol - mapCol) * deltaDistCol;
  } else {
    stepCol = 1;
    sideDistCol = (mapCol + 1 - originCol) * deltaDistCol;
  }
  if (dirRow < 0) {
    stepRow = -1;
    sideDistRow = (originRow - mapRow) * deltaDistRow;
  } else {
    stepRow = 1;
    sideDistRow = (mapRow + 1 - originRow) * deltaDistRow;
  }

  let side: 0 | 1 = 0;
  let distance = 0;
  while (distance < maxDistanceTiles) {
    if (sideDistCol < sideDistRow) {
      distance = sideDistCol;
      sideDistCol += deltaDistCol;
      mapCol += stepCol;
      side = 0;
    } else {
      distance = sideDistRow;
      sideDistRow += deltaDistRow;
      mapRow += stepRow;
      side = 1;
    }
    const hit = wallHitKindAt(mapName, mapRow, mapCol);
    if (hit.kind !== 'none') return { distance, kind: hit.kind, side };
  }
  return { distance: maxDistanceTiles, kind: 'none', side: 0 };
}

// Casts one ray per screen column (evenly spread across `fovRad` centered
// on `facingAngle`) and returns each column's PERPENDICULAR distance (the
// raw DDA distance projected onto the view-forward axis, via
// `* cos(relativeAngle)`) — using perpendicular rather than raw Euclidean
// distance is what avoids the classic "fisheye" bulge a naive raycaster
// gets at wide FOVs, and keeps this buffer directly comparable to a
// billboard's own perpDistance (see projectFirstPersonBillboard) for
// correct occlusion.
export function castFirstPersonWalls(
  mapName: MapName,
  playerCol: number,
  playerRow: number,
  facingAngle: number,
  fovRad: number,
  columnCount: number,
  maxDistanceTiles: number
): FirstPersonColumnHit[] {
  const halfFov = fovRad / 2;
  const columns: FirstPersonColumnHit[] = [];
  for (let i = 0; i < columnCount; i++) {
    const t = columnCount === 1 ? 0.5 : i / (columnCount - 1);
    const relativeAngle = -halfFov + t * fovRad;
    const rayAngle = facingAngle + relativeAngle;
    const hit = castFirstPersonRay(mapName, playerCol, playerRow, rayAngle, maxDistanceTiles);
    columns.push({ perpDistance: hit.distance * Math.cos(relativeAngle), kind: hit.kind, side: hit.side });
  }
  return columns;
}

function shadeColor(color: number, factor: number): number {
  const clamped = Math.max(0, Math.min(1, factor));
  const r = Math.round(((color >> 16) & 0xff) * clamped);
  const g = Math.round(((color >> 8) & 0xff) * clamped);
  const b = Math.round((color & 0xff) * clamped);
  return (r << 16) | (g << 8) | b;
}

// Draws the sky/floor/wall-strip pass into an already-created Graphics
// object (see WorldScene's own firstPersonWallGraphics) — fully cleared
// and redrawn every frame, same "just recompute it, it's cheap" treatment
// drawHpBar already gets. Flat-shaded per WallHit.kind (no textures, per
// the "for now" framing of the ask), linearly darkened by distance down to
// FP_MIN_WALL_BRIGHTNESS so distant walls dim toward the horizon rather
// than vanishing to pure black.
export function drawFirstPersonWalls(
  graphics: Phaser.GameObjects.Graphics,
  columns: FirstPersonColumnHit[],
  screenWidth: number,
  screenHeight: number,
  rayStridePx: number,
  maxDistanceTiles: number,
  skyColor: number,
  floorColor: number,
  pitchOffsetPx: number
): void {
  graphics.clear();
  // A follow-up ask: "the player should be able to look up and down" —
  // this is a 2.5D raycaster with no real vertical geometry, so pitch is
  // the classic "shift the horizon line (and everything drawn relative to
  // it) up or down, then clip at the screen edges" trick rather than true
  // 3D — see FP_MAX_PITCH_OFFSET_PX's own doc comment. Positive
  // pitchOffsetPx = looking up = the horizon (and more sky) shifts down.
  const horizonY = screenHeight / 2 + pitchOffsetPx;
  graphics.fillStyle(skyColor, 1);
  graphics.fillRect(0, 0, screenWidth, Math.max(0, horizonY));
  graphics.fillStyle(floorColor, 1);
  graphics.fillRect(0, Math.max(0, horizonY), screenWidth, screenHeight - Math.max(0, horizonY));

  columns.forEach((column, i) => {
    if (column.kind === 'none') return;
    const brightness = Math.max(FP_MIN_WALL_BRIGHTNESS, 1 - column.perpDistance / maxDistanceTiles);
    const baseColor = FP_WALL_COLOR_BY_KIND[column.kind];
    const shaded = shadeColor(baseColor, brightness * (column.side === 1 ? 0.8 : 1));
    const wallScreenHeight = Math.min(screenHeight * 4, screenHeight / Math.max(column.perpDistance, 0.0001));
    const x = i * rayStridePx;
    graphics.fillStyle(shaded, 1);
    graphics.fillRect(x, horizonY - wallScreenHeight / 2, rayStridePx, wallScreenHeight);
  });
}

export interface FirstPersonProjection {
  screenX: number;
  scale: number;
  perpDistance: number;
}

// Billboard projection for a monster/tree/player/NPC/whatever else while
// in first-person (see WorldScene's own billboard pool pass) — reuses
// whichever top-down texture/frame the entity's own ordinary sprite
// already has; this only computes WHERE on screen and how BIG to draw it,
// never what texture (see this file's own header comment on why: a flat
// scaled billboard of existing art, not a new first-person model per
// creature, is the deliberate v1 scope). Returns undefined when the
// entity is outside the (slightly padded, see FP_BILLBOARD_FOV_PAD_RAD)
// field of view — callers should hide/skip their pooled Image in that
// case rather than drawing something off to the side that'll never be
// seen.
export function projectFirstPersonBillboard(
  playerCol: number,
  playerRow: number,
  facingAngle: number,
  fovRad: number,
  fovPadRad: number,
  screenWidth: number,
  entityCol: number,
  entityRow: number,
  baseScale: number,
  referenceDistanceTiles: number
): FirstPersonProjection | undefined {
  const dCol = entityCol - playerCol;
  const dRow = entityRow - playerRow;
  const distance = Math.sqrt(dCol * dCol + dRow * dRow);
  if (distance < 0.0001) return undefined;
  const worldAngle = Math.atan2(dCol, -dRow);
  let relativeAngle = worldAngle - facingAngle;
  while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
  while (relativeAngle <= -Math.PI) relativeAngle += Math.PI * 2;
  const halfFov = fovRad / 2 + fovPadRad;
  if (relativeAngle < -halfFov || relativeAngle > halfFov) return undefined;
  const perpDistance = distance * Math.cos(relativeAngle);
  if (perpDistance <= 0.0001) return undefined;
  const screenX = (relativeAngle / (fovRad / 2)) * (screenWidth / 2) + screenWidth / 2;
  // Clamped (see FP_BILLBOARD_MAX_SCALE_MULTIPLIER's own doc comment) —
  // without this, an entity standing right next to the player
  // (perpDistance approaching 0) would blow up toward infinite scale.
  const scale = Math.min(baseScale * FP_BILLBOARD_MAX_SCALE_MULTIPLIER, baseScale * (referenceDistanceTiles / perpDistance));
  return { screenX, scale, perpDistance };
}
