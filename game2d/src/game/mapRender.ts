// Pure rendering helpers/constants shared by WorldScene — no DOM, no
// mutable module state, just math and small Phaser Graphics drawing.
import Phaser from 'phaser';
import type { MapName, Direction } from '../../shared/constants.js';
import { FLORO_SHOP_MAPS } from '../../shared/constants.js';
import type { FacingGroup } from '../characterSprites.js';

export const TILE_SIZE = 32;
export const TREE_TEXTURE_KEY = 'tree';
export const DAGGER_TEXTURE_KEY = 'held-dagger';
export const BONE_SHIELD_TEXTURE_KEY = 'held-bone-shield';
export const TORCH_HELD_TEXTURE_KEY = 'held-torch';

// Floro shop building (item 11) — 2 frames (0: facing right, 1: facing
// left, see tools/gen-shop-assets.mjs), each 3x3.5 tiles.
export const SHOP_BUILDING_TEXTURE_KEY = 'shop-building';
export const SHOP_BUILDING_FRAME_WIDTH = 96;
export const SHOP_BUILDING_FRAME_HEIGHT = 112;
export const SHOP_BUILDING_FACING_RIGHT_FRAME = 0;
export const SHOP_BUILDING_FACING_LEFT_FRAME = 1;

// The shop entrance door (item 12) — 2 frames (0: closed, 1: ajar; only
// frame 0 used today).
export const WOODEN_DOOR_TEXTURE_KEY = 'wooden-door';
export const WOODEN_DOOR_FRAME_WIDTH = 32;
export const WOODEN_DOOR_FRAME_HEIGHT = 40;
export const WOODEN_DOOR_CLOSED_FRAME = 0;

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
export const MOVEMENT_BAR_COLOR = 0xd4c24a;
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

// Facing IS the sheet's own row now — down/up/left/right are each real,
// fully distinct frames (see characterSprites.ts), not a 3-row sheet with
// a flipped "side" shared between left and right.
export type Facing = FacingGroup;

export function floorTextureFor(mapName: MapName): string {
  if (mapName === 'Labyrinth') return 'stone';
  if (mapName === 'Floro' || mapName === 'Kortho' || (FLORO_SHOP_MAPS as readonly string[]).includes(mapName)) return 'concrete';
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
