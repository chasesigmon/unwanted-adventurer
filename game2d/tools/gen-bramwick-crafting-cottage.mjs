// Adds the missing 6th frame ("Crafting Shop") to Bramwick's cottage
// spritesheet. Item 3 ("Add a 'Crafting Shop' in Floro, Kortho, and
// Bramwick") appended 'Bramwick Crafting Shop' to BRAMWICK_SHOP_MAPS and
// WorldScene already computes its frame index as
// BRAMWICK_SHOP_MAPS.indexOf(...) = 5 (shared/maps.ts/WorldScene.ts), but
// the actual bramwick-cottage-spritesheet.png asset was never regenerated
// with a 6th frame — so that out-of-range frame index silently fell back
// to frame 0 ("General Shop"), which is the exact bug reported ("the new
// shop... is also called General Shop").
//
// No original generator script for this spritesheet exists in tools/ (a
// gap from before this project's "keep every gen-*.mjs" convention), so
// rather than trying to exactly reverse-engineer it and risk any visual
// drift in the 5 existing cottages, this crops those 5 frames out of the
// CURRENT spritesheet byte-for-pixel-identical (via sharp) and appends
// one brand new "Crafting Shop" frame drawn (via PIL, for real text) in
// the same visual style — matching palette/proportions/sign-banner shape.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');
const SHEET_PATH = join(ASSETS_DIR, 'bramwick-cottage-spritesheet.png');
const NEW_FRAME_PATH = join(ASSETS_DIR, '.bramwick-crafting-cottage-frame.png');

const FRAME_W = 192;
const FRAME_H = 256;

const python = `
from PIL import Image, ImageDraw, ImageFont

FRAME_W, FRAME_H = ${FRAME_W}, ${FRAME_H}

ROOF_DARK = (90, 62, 38)
ROOF_LIGHT = (122, 84, 50)
CHIMNEY = (122, 74, 60)
WALL = (196, 168, 120)
WALL_TRIM = (120, 88, 54)
SIGN_WOOD = (168, 132, 78)
SIGN_BORDER = (90, 62, 38)
SIGN_TEXT = (30, 20, 10)
DOOR_WOOD = (90, 62, 38)
DOOR_FRAME = (56, 38, 22)
DOORKNOB = (200, 176, 110)
WINDOW_FRAME = (90, 62, 38)
WINDOW_GLASS = (245, 224, 150)

img = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Gabled roof, apex centered, same silhouette as the existing 5 cottages.
apex_y, base_y, left, right = 8, 92, 16, FRAME_W - 16
width = right - left
height = base_y - apex_y
for row in range(height):
    y = apex_y + row
    half = (row / height) * (width / 2)
    rx0 = int(left + width / 2 - half)
    rx1 = int(left + width / 2 + half)
    color = ROOF_DARK if row % 6 < 3 else ROOF_LIGHT
    d.rectangle([rx0, y, rx1, y + 1], fill=color)
d.rectangle([left - 10, base_y - 4, right + 10, base_y + 6], fill=ROOF_DARK)

# Chimney, right of center, poking above the roofline.
d.rectangle([124, 0, 148, 40], fill=CHIMNEY)

# Wall body.
d.rectangle([20, base_y + 4, FRAME_W - 20, FRAME_H - 6], fill=WALL)
d.rectangle([20, base_y + 4, 24, FRAME_H - 6], fill=WALL_TRIM)
d.rectangle([FRAME_W - 24, base_y + 4, FRAME_W - 20, FRAME_H - 6], fill=WALL_TRIM)
d.rectangle([FRAME_W // 2 - 2, base_y + 4, FRAME_W // 2 + 2, FRAME_H - 6], fill=WALL_TRIM)

# Sign banner just under the roof eave.
sign_top, sign_bottom = base_y + 14, base_y + 46
d.rectangle([28, sign_top, FRAME_W - 28, sign_bottom], fill=SIGN_WOOD, outline=SIGN_BORDER, width=3)
name = 'Crafting Shop'
font_size = 20
def load_font(size):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold.ttf', size)
    except Exception:
        try:
            return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', size)
        except Exception:
            return ImageFont.load_default()
font = load_font(font_size)
while font_size > 9:
    bbox = d.textbbox((0, 0), name, font=font)
    tw = bbox[2] - bbox[0]
    if tw <= FRAME_W - 40:
        break
    font_size -= 1
    font = load_font(font_size)
bbox = d.textbbox((0, 0), name, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (FRAME_W - tw) / 2 - bbox[0]
ty = sign_top + ((sign_bottom - sign_top) - th) / 2 - bbox[1]
d.text((tx, ty), name, fill=SIGN_TEXT, font=font)

# Two windows flanking the door.
for wx in (44, FRAME_W - 44 - 28):
    wy = sign_bottom + 14
    d.rectangle([wx, wy, wx + 28, wy + 28], fill=WINDOW_FRAME)
    d.rectangle([wx + 3, wy + 3, wx + 25, wy + 25], fill=WINDOW_GLASS)
    d.line([wx + 14, wy + 3, wx + 14, wy + 25], fill=WINDOW_FRAME, width=2)
    d.line([wx + 3, wy + 14, wx + 25, wy + 14], fill=WINDOW_FRAME, width=2)

# Door, centered, touching the frame's bottom edge.
door_w, door_h = 50, 96
dx0 = (FRAME_W - door_w) / 2
dy0 = FRAME_H - door_h
d.rectangle([dx0 - 5, dy0 - 5, dx0 + door_w + 5, FRAME_H], fill=DOOR_FRAME)
d.rectangle([dx0, dy0, dx0 + door_w, FRAME_H], fill=DOOR_WOOD)
d.ellipse([dx0 + door_w - 14, dy0 + 44, dx0 + door_w - 6, dy0 + 52], fill=DOORKNOB)

img.save("${NEW_FRAME_PATH}")
print("wrote frame")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });

const existing = sharp(SHEET_PATH);
const meta = await existing.metadata();
const frameCount = Math.round(meta.width / FRAME_W);
console.log(`Existing sheet has ${frameCount} frame(s), extracting each unchanged...`);

const frameBuffers = [];
for (let i = 0; i < frameCount; i++) {
  const buf = await sharp(SHEET_PATH)
    .extract({ left: i * FRAME_W, top: 0, width: FRAME_W, height: FRAME_H })
    .png()
    .toBuffer();
  frameBuffers.push(buf);
}
frameBuffers.push(await sharp(NEW_FRAME_PATH).png().toBuffer());

const composite = sharp({
  create: {
    width: FRAME_W * frameBuffers.length,
    height: FRAME_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
});

await composite
  .composite(frameBuffers.map((input, i) => ({ input, left: i * FRAME_W, top: 0 })))
  .png()
  .toFile(SHEET_PATH);

console.log(`Wrote ${SHEET_PATH} (${FRAME_W * frameBuffers.length}x${FRAME_H}, ${frameBuffers.length} frames)`);
