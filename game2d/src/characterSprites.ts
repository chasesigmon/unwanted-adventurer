// Loads the real PNG spritesheets (game2d/assets/*-spritesheet.png) and
// builds the walk + punch animations for every kind — playable races
// (including the evolved-only hobgoblin), wild monster kinds, and a
// handful of decorative-only kinds with no gameplay hookup yet — all
// sharing the same rig/layout (4 fully distinct directional rows:
// down/up/left/right, 8 columns per row: 4 walk frames then 4 punch
// frames). No runtime horizontal flip anywhere — "right" is its own real
// row baked into the PNG (a mirror of "left" applied at generation time).
import type { Race, MonsterKind } from '../shared/constants.js';

export const FRAME_WIDTH = 110;
export const FRAME_HEIGHT = 140;
const WALK_FRAME_COUNT = 4;
const PUNCH_FRAME_COUNT = 4;
const COLS_PER_ROW = WALK_FRAME_COUNT + PUNCH_FRAME_COUNT;

export type FacingGroup = 'down' | 'up' | 'left' | 'right';
const ROW_INDEX: Record<FacingGroup, number> = { down: 0, up: 1, left: 2, right: 3 };

// Kinds with a spritesheet but no gameplay hookup yet (no playable race,
// no spawned monster) — assets exist and their walk/punch anims are
// fully created/playable, ready for whatever uses them next.
export type DecorativeKind = 'ogre' | 'zombie' | 'slime' | 'dragonman';

// A "kind" is anything with its own spritesheet — a playable race
// (including the evolved-only hobgoblin), a wild monster kind, or one of
// the decorative-only kinds above.
export type SpriteKind = Race | MonsterKind | DecorativeKind;

const TEXTURE_KEYS: Record<SpriteKind, string> = {
  goblin: 'goblin',
  skeleton: 'skeleton',
  hobgoblin: 'hobgoblin',
  'wild goblin': 'wild-goblin',
  'wild skeleton': 'wild-skeleton',
  ogre: 'ogre',
  zombie: 'zombie',
  slime: 'slime',
  dragonman: 'dragon-man',
};
const SHEET_PATHS: Record<SpriteKind, string> = {
  goblin: '/goblin-spritesheet.png',
  skeleton: '/skeleton-spritesheet.png',
  hobgoblin: '/hobgoblin-spritesheet.png',
  'wild goblin': '/wild-goblin-spritesheet.png',
  'wild skeleton': '/wild-skeleton-spritesheet.png',
  ogre: '/ogre-spritesheet.png',
  zombie: '/zombie-spritesheet.png',
  slime: '/slime-spritesheet.png',
  dragonman: '/dragon-man-spritesheet.png',
};

export function textureKeyFor(kind: SpriteKind): string {
  return TEXTURE_KEYS[kind];
}

export function idleFrameFor(kind: SpriteKind, facing: FacingGroup): number {
  return ROW_INDEX[facing] * COLS_PER_ROW;
}

export function walkAnimKey(kind: SpriteKind, facing: FacingGroup): string {
  return `${TEXTURE_KEYS[kind]}-walk-${facing}`;
}

export function punchAnimKey(kind: SpriteKind, facing: FacingGroup): string {
  return `${TEXTURE_KEYS[kind]}-punch-${facing}`;
}

export function preloadCharacterSprites(scene: Phaser.Scene): void {
  for (const kind of Object.keys(SHEET_PATHS) as SpriteKind[]) {
    scene.load.spritesheet(TEXTURE_KEYS[kind], SHEET_PATHS[kind], {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });
  }
}

// A corpse's lootable body-part icon reuses the sheet itself rather than
// needing a separate asset: a small crop of the down-facing idle frame's
// head/ears region (every generator draws the head in the same y-range,
// see game2d/assets' generator scripts), registered once as a named
// sub-frame of the existing texture.
const BODY_PART_FRAME_HEIGHT = 70;

export function bodyPartFrameKey(kind: SpriteKind): string {
  return `${TEXTURE_KEYS[kind]}-bodypart`;
}

export function defineBodyPartFrames(scene: Phaser.Scene): void {
  for (const kind of Object.keys(SHEET_PATHS) as SpriteKind[]) {
    const texture = scene.textures.get(TEXTURE_KEYS[kind]);
    const frameKey = bodyPartFrameKey(kind);
    if (!texture.has(frameKey)) {
      texture.add(frameKey, 0, 0, 0, FRAME_WIDTH, BODY_PART_FRAME_HEIGHT);
    }
  }
}

export function createCharacterAnims(scene: Phaser.Scene): void {
  for (const kind of Object.keys(SHEET_PATHS) as SpriteKind[]) {
    const textureKey = TEXTURE_KEYS[kind];
    (['down', 'up', 'left', 'right'] as FacingGroup[]).forEach((facing) => {
      const rowStart = ROW_INDEX[facing] * COLS_PER_ROW;

      scene.anims.create({
        key: walkAnimKey(kind, facing),
        frames: scene.anims.generateFrameNumbers(textureKey, {
          start: rowStart,
          end: rowStart + WALK_FRAME_COUNT - 1,
        }),
        frameRate: 8,
        repeat: -1,
      });

      scene.anims.create({
        key: punchAnimKey(kind, facing),
        frames: scene.anims.generateFrameNumbers(textureKey, {
          start: rowStart + WALK_FRAME_COUNT,
          end: rowStart + WALK_FRAME_COUNT + PUNCH_FRAME_COUNT - 1,
        }),
        frameRate: 12,
        repeat: 0,
      });
    });
  }
}
