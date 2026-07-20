// Pixel-art generator for items 22/24/27/28/29's new monster sprites:
// the gobbler (+ its 3 hut-boss variants), the Coven Witch, the troll,
// the rune beast, and the woodland fairy. One combined script (instead of
// one file per creature like gen-imp/gen-wolf/gen-moose) purely to share
// the boilerplate grid/rasterizer infra those scripts each duplicate —
// every creature below still gets its own distinct silhouette/palette/
// decoration, same "big pixel" grid + EXACT character rig as every other
// monster here (see gen-imp-sprites.mjs's own header): 110x140 frame, 4
// rows (down/up/left/right), 8 cols/row (4 walk frames then 4 punch/cast
// frames).
//
// Run with `node tools/gen-batch2-sprites.mjs` from game2d/; requires the
// `pngjs` devDependency (already installed for the other gen-*.mjs scripts).
import { PNG } from 'pngjs';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const CELL = 5;
const COLS = 22;
const ROWS = 28;

function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function createGrid() {
  const cells = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < ROWS && xx >= 0 && xx < COLS) cells[yy][xx] = color;
        }
      }
    },
    set(x, y, color) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) cells[y][x] = color;
    },
  };
}

function rasterizeCharacterSheet(frameGrids, outPath) {
  const frameWidth = COLS * CELL;
  const frameHeight = ROWS * CELL;
  const png = new PNG({ width: frameWidth * 8, height: frameHeight * 4 });
  png.data.fill(0);

  const ROW_ORDER = ['down', 'up', 'left', 'right'];
  ROW_ORDER.forEach((facing, rowIdx) => {
    for (let col = 0; col < 8; col++) {
      const grid = frameGrids[facing][col];
      const offsetX = col * frameWidth;
      const offsetY = rowIdx * frameHeight;
      for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
          const color = grid.cells[cy][cx];
          if (!color) continue;
          const { r, g, b } = hex(color);
          for (let py = 0; py < CELL; py++) {
            for (let px = 0; px < CELL; px++) {
              const x = offsetX + cx * CELL + px;
              const y = offsetY + cy * CELL + py;
              const idx = (frameWidth * 8 * y + x) << 2;
              png.data[idx] = r;
              png.data[idx + 1] = g;
              png.data[idx + 2] = b;
              png.data[idx + 3] = 255;
            }
          }
        }
      }
    }
  });

  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote ${outPath} (${frameWidth * 8}x${frameHeight * 4})`);
}

const WALK_POSES = [
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: 1, legSwing: 1, bob: -1 },
  { armSwing: 0, legSwing: 0, bob: 0 },
  { armSwing: -1, legSwing: -1, bob: -1 },
];
const ACTION_POSES = [{ extend: -1 }, { extend: 1 }, { extend: 3 }, { extend: 1 }];

function buildFrameSet(drawFrame) {
  const frames = {};
  for (const facing of ['down', 'up', 'left', 'right']) {
    frames[facing] = [];
    for (const pose of WALK_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, armSwing: pose.armSwing, legSwing: pose.legSwing, bob: pose.bob });
      frames[facing].push(grid);
    }
    for (const pose of ACTION_POSES) {
      const grid = createGrid();
      drawFrame(grid, { facing, extend: pose.extend });
      frames[facing].push(grid);
    }
  }
  return frames;
}

// ============================================================
// Gobbler + its 3 hut-boss variants — "an oval red creature with legs
// and white eyes and a big open mouth." No separate head/torso like the
// biped rig every other monster here uses — the whole body IS the oval,
// with the mouth and eyes drawn directly onto it. Variants add a small
// robe/helmet/headdress tint plus a held weapon silhouette.
function drawGobblerFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }, variant) {
  const BODY = variant === 'necromancer' ? 0x8a2a2a : variant === 'warrior' ? 0xb43a2a : variant === 'chieftain' ? 0x9a2020 : 0xc0392b;
  const BODY_DARK = 0x6e1f1f;
  const EYE = 0xf5f0e6;
  const MOUTH = 0x1a0505;
  const TOOTH = 0xf5f0e6;
  const GEAR = variant === 'necromancer' ? 0x2a1a3a : variant === 'warrior' ? 0x555555 : variant === 'chieftain' ? 0x6b4a1a : null;

  const bodyTop = 6 + bob;
  const bodyBottom = ROWS - 9 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 12;
  const bodyX = Math.round((COLS - bodyWidth) / 2);

  // The oval silhouette — width tapers in near top and bottom, widest at
  // the middle, same "row-varying width" trick the imp's torso uses.
  for (let row = 0; row < bodyHeight; row++) {
    const t = Math.abs(row / (bodyHeight - 1) - 0.5) * 2; // 0 at middle, 1 at edges
    const width = Math.max(2, Math.round(bodyWidth - t * t * bodyWidth * 0.75));
    const x = bodyX + Math.round((bodyWidth - width) / 2);
    grid.fillRect(x, bodyTop + row, width, 1, row % 5 < 4 ? BODY : BODY_DARK);
  }

  // Chieftain's headdress / necromancer's hood / warrior's helm — a thin
  // band across the top of the oval.
  if (GEAR) grid.fillRect(bodyX + 2, bodyTop - 1, bodyWidth - 4, 2, GEAR);

  // Eyes + big open mouth, front/back only shows a hint of the same.
  const eyeY = bodyTop + Math.round(bodyHeight * 0.32);
  if (facing === 'down') {
    grid.set(bodyX + 4, eyeY, EYE);
    grid.set(bodyX + bodyWidth - 5, eyeY, EYE);
    const mouthY = bodyTop + Math.round(bodyHeight * 0.55);
    grid.fillRect(bodyX + 3, mouthY, bodyWidth - 6, 4, MOUTH);
    grid.set(bodyX + 4, mouthY, TOOTH);
    grid.set(bodyX + bodyWidth - 5, mouthY, TOOTH);
  } else if (facing === 'left' || facing === 'right') {
    const eyeX = facing === 'left' ? bodyX + 3 : bodyX + bodyWidth - 4;
    grid.set(eyeX, eyeY, EYE);
    const mouthX = facing === 'left' ? bodyX + 1 : bodyX + bodyWidth - 6;
    grid.fillRect(mouthX, bodyTop + Math.round(bodyHeight * 0.5), 5, 3, MOUTH);
  }
  // 'up' shows a plain back — no face.

  // Short stubby legs.
  const legY = bodyBottom;
  const legH = ROWS - legY - Math.max(0, bob);
  grid.fillRect(bodyX + 2, legY + Math.max(0, -legSwing), 3, legH, BODY_DARK);
  grid.fillRect(bodyX + bodyWidth - 5, legY + Math.max(0, legSwing), 3, legH, BODY_DARK);

  // Tiny arm stubs, swinging opposite the legs.
  const armY = bodyTop + Math.round(bodyHeight * 0.4);
  grid.fillRect(bodyX - 2, armY + Math.max(0, -armSwing), 2, 5, BODY);
  grid.fillRect(bodyX + bodyWidth, armY + Math.max(0, armSwing), 2, 5, BODY);

  // The boss variants' own held weapon, and the regular gobbler's own
  // bite/lunge — drawn last so it reaches past the silhouette.
  if (extend !== null) {
    const weaponColor = variant === 'necromancer' ? 0x8a6a2a : variant === 'warrior' ? 0xcccccc : variant === 'chieftain' ? 0x5a3a1a : MOUTH;
    const len = variant ? 5 : 3;
    if (facing === 'down') grid.fillRect(bodyX + 3, bodyBottom + 2 + extend, bodyWidth - 6, 2, weaponColor === MOUTH ? TOOTH : weaponColor);
    else if (facing === 'up') grid.fillRect(bodyX + 3, bodyTop - 3 - extend, bodyWidth - 6, 2, weaponColor);
    else if (facing === 'left') grid.fillRect(bodyX - 3 - extend, armY, len, 2, weaponColor);
    else grid.fillRect(bodyX + bodyWidth + extend, armY, len, 2, weaponColor);
  }
}

for (const variant of [undefined, 'necromancer', 'warrior', 'chieftain']) {
  const outName = variant ? `gobbler-${variant}-spritesheet.png` : 'gobbler-spritesheet.png';
  rasterizeCharacterSheet(buildFrameSet((grid, pose) => drawGobblerFrame(grid, pose, variant)), join(ASSETS_DIR, outName));
}

// ============================================================
// Coven Witch — humanoid, dark hooded robe, pale glowing eyes, a wand
// held for its own ranged cast.
const WITCH_SKIN = 0xc9b896;
const WITCH_ROBE = 0x2e1a3a;
const WITCH_ROBE_DARK = 0x1c0f24;
const WITCH_HAT = 0x1a0e22;
const WITCH_EYE = 0x9de0ff;
const WITCH_HEAD_W = 8;
const WITCH_HEAD_H = 7;
const WITCH_HEAD_X = Math.round((COLS - WITCH_HEAD_W) / 2);

function drawWitchFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 7 + bob;
  const bodyTop = headY + WITCH_HEAD_H - 1;
  const bodyBottom = ROWS - 6 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 11;
  const bodyX = WITCH_HEAD_X + Math.round((WITCH_HEAD_W - bodyWidth) / 2);

  // Pointed witch hat.
  grid.fillRect(WITCH_HEAD_X + 2, headY - 6, 4, 3, WITCH_HAT);
  grid.fillRect(WITCH_HEAD_X + 1, headY - 3, 6, 2, WITCH_HAT);
  grid.fillRect(WITCH_HEAD_X - 1, headY - 1, WITCH_HEAD_W + 2, 2, WITCH_HAT);

  grid.fillRect(WITCH_HEAD_X, headY, WITCH_HEAD_W, WITCH_HEAD_H, WITCH_SKIN);
  if (facing === 'down') {
    grid.set(WITCH_HEAD_X + 2, headY + 3, WITCH_EYE);
    grid.set(WITCH_HEAD_X + 5, headY + 3, WITCH_EYE);
  } else if (facing === 'left' || facing === 'right') {
    grid.set(facing === 'left' ? WITCH_HEAD_X + 2 : WITCH_HEAD_X + 5, headY + 3, WITCH_EYE);
  }

  // Flowing robe — same tapering-width trick, wider at the hem.
  for (let row = 0; row < bodyHeight; row++) {
    const t = row / Math.max(1, bodyHeight - 1);
    const width = Math.round(bodyWidth + t * 4);
    const x = bodyX - Math.round((width - bodyWidth) / 2);
    grid.fillRect(x, bodyTop + row, width, 1, row % 6 < 4 ? WITCH_ROBE : WITCH_ROBE_DARK);
  }

  const legY = bodyBottom;
  const legH = ROWS - legY - Math.max(0, bob);
  grid.fillRect(bodyX + 2, legY, 2, legH, WITCH_ROBE_DARK);
  grid.fillRect(bodyX + bodyWidth - 4, legY, 2, legH, WITCH_ROBE_DARK);

  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 2 : bodyX + bodyWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 2, 6, WITCH_ROBE);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  // The wand's own bolt — ranged magical damage, drawn as a small glowing
  // orb thrown out ahead rather than a melee fist extend.
  if (extend !== null) {
    const boltY = armY + 3;
    if (facing === 'down') grid.fillRect(WITCH_HEAD_X + 3, boltY + 4 + extend, 2, 2, WITCH_EYE);
    else if (facing === 'up') grid.fillRect(WITCH_HEAD_X + 3, headY - 2 - extend, 2, 2, WITCH_EYE);
    else if (facing === 'left') grid.fillRect(bodyX - 3 - extend, boltY, 2, 2, WITCH_EYE);
    else grid.fillRect(bodyX + bodyWidth + extend, boltY, 2, 2, WITCH_EYE);
  }
}
rasterizeCharacterSheet(buildFrameSet(drawWitchFrame), join(ASSETS_DIR, 'coven-witch-spritesheet.png'));

// ============================================================
// Troll — big, hunched, brutish. Bigger head/body than the imp rig, long
// dangling arms, grey-green hide.
const TROLL_SKIN = 0x6b7a4a;
const TROLL_SKIN_DARK = 0x4a5730;
const TROLL_EYE = 0xd9c020;
const TROLL_HEAD_W = 10;
const TROLL_HEAD_H = 8;
const TROLL_HEAD_X = Math.round((COLS - TROLL_HEAD_W) / 2);

function drawTrollFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 4 + bob;
  const bodyTop = headY + TROLL_HEAD_H - 1;
  const bodyBottom = ROWS - 6 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 14;
  const bodyX = TROLL_HEAD_X + Math.round((TROLL_HEAD_W - bodyWidth) / 2);

  grid.fillRect(TROLL_HEAD_X, headY, TROLL_HEAD_W, TROLL_HEAD_H, TROLL_SKIN);
  // Small brow ridge + tusks.
  grid.fillRect(TROLL_HEAD_X + 1, headY - 1, TROLL_HEAD_W - 2, 1, TROLL_SKIN_DARK);
  if (facing === 'down') {
    grid.set(TROLL_HEAD_X + 2, headY + 4, TROLL_EYE);
    grid.set(TROLL_HEAD_X + 7, headY + 4, TROLL_EYE);
    grid.fillRect(TROLL_HEAD_X + 2, headY + TROLL_HEAD_H - 1, 1, 2, 0xf0f0f0);
    grid.fillRect(TROLL_HEAD_X + 7, headY + TROLL_HEAD_H - 1, 1, 2, 0xf0f0f0);
  } else if (facing === 'left' || facing === 'right') {
    grid.set(facing === 'left' ? TROLL_HEAD_X + 2 : TROLL_HEAD_X + 7, headY + 4, TROLL_EYE);
  }

  for (let row = 0; row < bodyHeight; row++) {
    const t = row / Math.max(1, bodyHeight - 1);
    const width = Math.round(bodyWidth - t * 3);
    const x = bodyX + Math.round((bodyWidth - width) / 2);
    grid.fillRect(x, bodyTop + row, width, 1, row % 6 < 4 ? TROLL_SKIN : TROLL_SKIN_DARK);
  }

  const legY = bodyBottom;
  const legH = ROWS - legY - Math.max(0, bob);
  const drawLeg = (side, swingOffset) => {
    const x = side === 'left' ? bodyX + 2 : bodyX + bodyWidth - 5;
    const y = legY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, legH, TROLL_SKIN_DARK);
  };
  drawLeg('left', legSwing);
  drawLeg('right', -legSwing);

  // Long, heavy arms — thicker than every other biped here.
  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 3 : bodyX + bodyWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, 9, TROLL_SKIN);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  if (extend !== null) {
    const fistY = armY + 5;
    if (facing === 'down') grid.fillRect(TROLL_HEAD_X + 2, fistY + 4 + extend, 4, 3, TROLL_SKIN);
    else if (facing === 'up') grid.fillRect(TROLL_HEAD_X + 2, headY - 1 - extend, 4, 3, TROLL_SKIN);
    else if (facing === 'left') grid.fillRect(bodyX - 4 - extend, fistY, 4, 3, TROLL_SKIN);
    else grid.fillRect(bodyX + bodyWidth + extend, fistY, 4, 3, TROLL_SKIN);
  }
}
rasterizeCharacterSheet(buildFrameSet(drawTrollFrame), join(ASSETS_DIR, 'troll-spritesheet.png'));

// ============================================================
// Rune Beast — a stone/crystal golem-like humanoid, blocky silhouette,
// glowing rune markings.
const RUNE_STONE = 0x5a5a63;
const RUNE_STONE_DARK = 0x3d3d44;
const RUNE_GLOW = 0x66e0e8;
const RUNE_HEAD_W = 9;
const RUNE_HEAD_H = 7;
const RUNE_HEAD_X = Math.round((COLS - RUNE_HEAD_W) / 2);

function drawRuneBeastFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 5 + bob;
  const bodyTop = headY + RUNE_HEAD_H - 1;
  const bodyBottom = ROWS - 7 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 12;
  const bodyX = RUNE_HEAD_X + Math.round((RUNE_HEAD_W - bodyWidth) / 2);

  grid.fillRect(RUNE_HEAD_X, headY, RUNE_HEAD_W, RUNE_HEAD_H, RUNE_STONE);
  if (facing === 'down') {
    grid.set(RUNE_HEAD_X + 2, headY + 3, RUNE_GLOW);
    grid.set(RUNE_HEAD_X + 6, headY + 3, RUNE_GLOW);
  } else if (facing === 'left' || facing === 'right') {
    grid.set(facing === 'left' ? RUNE_HEAD_X + 2 : RUNE_HEAD_X + 6, headY + 3, RUNE_GLOW);
  }

  // Blocky torso — no taper, a golem's slab-like body.
  grid.fillRect(bodyX, bodyTop, bodyWidth, bodyHeight, RUNE_STONE);
  for (let row = 1; row < bodyHeight; row += 3) grid.fillRect(bodyX + 1, bodyTop + row, bodyWidth - 2, 1, RUNE_STONE_DARK);
  // Glowing rune markings down the chest.
  grid.set(bodyX + Math.floor(bodyWidth / 2), bodyTop + 2, RUNE_GLOW);
  grid.set(bodyX + Math.floor(bodyWidth / 2), bodyTop + 5, RUNE_GLOW);

  const legY = bodyBottom;
  const legH = ROWS - legY - Math.max(0, bob);
  const drawLeg = (side, swingOffset) => {
    const x = side === 'left' ? bodyX + 2 : bodyX + bodyWidth - 5;
    const y = legY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, legH, RUNE_STONE_DARK);
  };
  drawLeg('left', legSwing);
  drawLeg('right', -legSwing);

  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 3 : bodyX + bodyWidth + 1;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 3, 8, RUNE_STONE);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  if (extend !== null) {
    const fistY = armY + 4;
    if (facing === 'down') grid.fillRect(RUNE_HEAD_X + 2, fistY + 4 + extend, 4, 3, RUNE_STONE);
    else if (facing === 'up') grid.fillRect(RUNE_HEAD_X + 2, headY - 1 - extend, 4, 3, RUNE_STONE);
    else if (facing === 'left') grid.fillRect(bodyX - 4 - extend, fistY, 4, 3, RUNE_STONE);
    else grid.fillRect(bodyX + bodyWidth + extend, fistY, 4, 3, RUNE_STONE);
  }
}
rasterizeCharacterSheet(buildFrameSet(drawRuneBeastFrame), join(ASSETS_DIR, 'rune-beast-spritesheet.png'));

// ============================================================
// Woodland Fairy — small, slender, green/brown skin, a pair of
// translucent wings, ranged magical damage (a small glowing bolt).
const FAIRY_SKIN = 0x8fae63;
const FAIRY_SKIN_DARK = 0x5f7a3f;
const FAIRY_WING = 0xcdeaff;
const FAIRY_EYE = 0x1a1a1a;
const FAIRY_GLOW = 0xc8ff8a;
const FAIRY_HEAD_W = 6;
const FAIRY_HEAD_H = 6;
const FAIRY_HEAD_X = Math.round((COLS - FAIRY_HEAD_W) / 2);

function drawFairyFrame(grid, { facing, armSwing = 0, legSwing = 0, bob = 0, extend = null }) {
  const headY = 8 + bob;
  const bodyTop = headY + FAIRY_HEAD_H - 1;
  const bodyBottom = ROWS - 10 + bob;
  const bodyHeight = bodyBottom - bodyTop;
  const bodyWidth = 6;
  const bodyX = FAIRY_HEAD_X + Math.round((FAIRY_HEAD_W - bodyWidth) / 2);

  // Wings, behind the body — a simple translucent-looking pair of ovals.
  grid.fillRect(bodyX - 5, bodyTop - 1, 4, 6, FAIRY_WING);
  grid.fillRect(bodyX + bodyWidth + 1, bodyTop - 1, 4, 6, FAIRY_WING);

  grid.fillRect(FAIRY_HEAD_X, headY, FAIRY_HEAD_W, FAIRY_HEAD_H, FAIRY_SKIN);
  if (facing === 'down') {
    grid.set(FAIRY_HEAD_X + 1, headY + 3, FAIRY_EYE);
    grid.set(FAIRY_HEAD_X + 4, headY + 3, FAIRY_EYE);
  } else if (facing === 'left' || facing === 'right') {
    grid.set(facing === 'left' ? FAIRY_HEAD_X + 1 : FAIRY_HEAD_X + 4, headY + 3, FAIRY_EYE);
  }

  for (let row = 0; row < bodyHeight; row++) {
    grid.fillRect(bodyX, bodyTop + row, bodyWidth, 1, row % 4 < 3 ? FAIRY_SKIN : FAIRY_SKIN_DARK);
  }

  const legY = bodyBottom;
  const legH = ROWS - legY - Math.max(0, bob);
  const drawLeg = (side, swingOffset) => {
    const x = side === 'left' ? bodyX : bodyX + bodyWidth - 1;
    const y = legY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 1, legH, FAIRY_SKIN_DARK);
  };
  drawLeg('left', legSwing);
  drawLeg('right', -legSwing);

  const armY = bodyTop + 1;
  const drawArm = (side, swingOffset) => {
    const x = side === 'left' ? bodyX - 1 : bodyX + bodyWidth;
    const y = armY + Math.max(0, -swingOffset);
    grid.fillRect(x, y, 1, 4, FAIRY_SKIN);
  };
  if (facing === 'down' || facing === 'up') {
    drawArm('left', armSwing);
    drawArm('right', -armSwing);
  } else {
    drawArm(facing === 'left' ? 'left' : 'right', armSwing);
  }

  // A small glowing bolt thrown out ahead — same ranged-cast convention
  // as the coven witch's own wand bolt above.
  if (extend !== null) {
    const boltY = armY + 2;
    if (facing === 'down') grid.fillRect(FAIRY_HEAD_X + 2, boltY + 3 + extend, 2, 2, FAIRY_GLOW);
    else if (facing === 'up') grid.fillRect(FAIRY_HEAD_X + 2, headY - 2 - extend, 2, 2, FAIRY_GLOW);
    else if (facing === 'left') grid.fillRect(bodyX - 2 - extend, boltY, 2, 2, FAIRY_GLOW);
    else grid.fillRect(bodyX + bodyWidth + extend, boltY, 2, 2, FAIRY_GLOW);
  }
}
rasterizeCharacterSheet(buildFrameSet(drawFairyFrame), join(ASSETS_DIR, 'woodland-fairy-spritesheet.png'));
