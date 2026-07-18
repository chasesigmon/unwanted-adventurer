// Pure rendering helpers/constants shared by WorldScene — no DOM, no
// mutable module state, just math and small Phaser Graphics drawing.
import Phaser from 'phaser';
import type { MapName, Direction } from '../../shared/constants.js';
import { FLORO_SHOP_MAPS, GRIMOAK_CASTLE_MAPS, BRAMWICK_SHOP_MAPS, KORTHO_SHOP_MAPS } from '../../shared/constants.js';
import type { FacingGroup } from '../characterSprites.js';

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
export const TREE_TEXTURE_KEY = 'tree';
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
  'Summoning Classroom': 'classroom-symbol-summoning',
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
export const PET_TEXTURE_KEYS: Record<'puppy' | 'kitten' | 'piglet', string> = {
  puppy: 'pet-puppy',
  kitten: 'pet-kitten',
  piglet: 'pet-piglet',
};
export const PET_FRAME_WIDTH = 24;
export const PET_FRAME_HEIGHT = 24;

// A pet's own evolved form (a later follow-up ask: "create a sprite that
// is slightly larger and modelled differently for each respective pet"
// — evolution previously just renamed the pet and reused its un-evolved
// spritesheet, see PET_EVOLUTION_LEVEL's own doc comment). Real, distinct
// art per kind (see tools/gen-pet-evolved-assets.mjs) at a bigger frame
// size — WorldScene picks between these and PET_TEXTURE_KEYS above by
// comparing a pet's own `name` against PET_EVOLVED_NAME.
export const PET_EVOLVED_TEXTURE_KEYS: Record<'puppy' | 'kitten' | 'piglet', string> = {
  puppy: 'pet-dog',
  kitten: 'pet-cat',
  piglet: 'pet-boar',
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
  return 'grass';
}

export function facingForDirection(direction: Direction): Facing {
  if (direction === 'north') return 'up';
  if (direction === 'south') return 'down';
  return direction === 'west' ? 'left' : 'right';
}

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
