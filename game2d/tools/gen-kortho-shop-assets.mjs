// One-time pixel-art generator for Kortho's 7 shop building sprites (a
// later follow-up ask: "update the shops in Kortho so that they look like
// modern medieval shops that would belong in that stone age town, create
// a sprite for the shops and put the name of the shop at the top of each
// respective one"). Delegates the actual drawing to a small inline Python
// (PIL) script — same "python3 inline script, real PNG asset, no runtime
// canvas-draw" convention this project's other sprites use — because PIL
// can render real, legible text for the name banner, unlike the
// hand-rolled coarse-pixel grid tools/gen-shop-assets.mjs uses for Floro
// (which has no text baked in at all).
//
// Run once with `node tools/gen-kortho-shop-assets.mjs` from game2d/
// whenever the art needs regenerating. Frame size matches Bramwick's own
// cottage spritesheet (192x256/frame) — same "one real building per shop"
// scale — one frame per KORTHO_SHOP_MAPS entry, in that exact order, so
// WorldScene's own frame = KORTHO_SHOP_MAPS.indexOf(shopMapName)
// convention (mirroring Bramwick's cottageSprites) lines up.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'assets', 'kortho-shop-spritesheet.png');

const SHOP_NAMES = ['Blacksmith', 'General Store', 'Inn', 'Bank', 'Armorer', 'Pet Salesman', 'Boat Shop'];

const python = `
import random
from PIL import Image, ImageDraw, ImageFont

FRAME_W, FRAME_H = 192, 256
NAMES = ${JSON.stringify(SHOP_NAMES)}

ROOF_DARK = (58, 58, 66)
ROOF_LIGHT = (78, 78, 88)
STONE_LIGHT = (168, 164, 152)
STONE_MID = (140, 136, 124)
STONE_DARK = (110, 106, 96)
MORTAR = (90, 88, 80)
SIGN_WOOD = (94, 62, 34)
SIGN_BORDER = (54, 34, 18)
SIGN_TEXT = (240, 228, 200)
DOOR_WOOD = (74, 48, 24)
DOOR_FRAME = (40, 26, 14)
DOOR_BAND = (30, 20, 10)
WINDOW_FRAME = (60, 40, 22)
WINDOW_GLASS = (120, 150, 160)
SHUTTER = (70, 40, 22)

random.seed(7)

def stone_wall(draw, x0, y0, x1, y1):
    # Coarse ashlar-block pattern: rows of offset rectangular stones with
    # a mortar-colored background showing through as gaps between them.
    draw.rectangle([x0, y0, x1, y1], fill=MORTAR)
    block_h = 14
    y = y0
    row = 0
    while y < y1:
        offset = 0 if row % 2 == 0 else 10
        x = x0 - offset
        while x < x1:
            w = random.choice([18, 22, 26])
            shade = random.choice([STONE_LIGHT, STONE_MID, STONE_MID, STONE_DARK])
            bx0, by0 = max(x, x0), y
            bx1, by1 = min(x + w, x1), min(y + block_h, y1)
            if bx1 > bx0 and by1 > by0:
                draw.rectangle([bx0, by0, bx1 - 2, by1 - 2], fill=shade)
            x += w + 2
        y += block_h
        row += 1

def gabled_roof(draw, apex_y, base_y, left, right):
    width = right - left
    height = base_y - apex_y
    for row in range(height):
        y = apex_y + row
        half = (row / height) * (width / 2)
        rx0 = int(left + width / 2 - half) - 3
        rx1 = int(left + width / 2 + half) + 3
        color = ROOF_DARK if row % 4 < 2 else ROOF_LIGHT
        draw.rectangle([rx0, y, rx1, y + 1], fill=color)
    # eave overhang
    draw.rectangle([left - 8, base_y - 2, right + 8, base_y + 4], fill=ROOF_DARK)

def load_font(size):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Bold.ttf', size)
    except Exception:
        try:
            return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', size)
        except Exception:
            return ImageFont.load_default()

def build_frame(name):
    img = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Roof (rows ~0-46)
    gabled_roof(d, apex_y=4, base_y=46, left=20, right=FRAME_W - 20)

    # Stone wall body (rows 46-224, leaving 224-256 for the door to touch
    # the frame's own bottom edge — the same "baked-in door touches the
    # sprite's bottom" convention Bramwick's cottages use, so no separate
    # generic door sprite is needed).
    stone_wall(d, 12, 46, FRAME_W - 12, 224)

    # Name sign banner, mounted near the top of the wall just under the
    # roof eave (the literal ask: "put the name of the shop at the top").
    sign_top, sign_bottom = 54, 86
    d.rectangle([16, sign_top, FRAME_W - 16, sign_bottom], fill=SIGN_WOOD, outline=SIGN_BORDER, width=3)
    font_size = 22
    font = load_font(font_size)
    while font_size > 10:
        bbox = d.textbbox((0, 0), name, font=font)
        tw = bbox[2] - bbox[0]
        if tw <= FRAME_W - 32:
            break
        font_size -= 2
        font = load_font(font_size)
    bbox = d.textbbox((0, 0), name, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (FRAME_W - tw) / 2 - bbox[0]
    ty = sign_top + ((sign_bottom - sign_top) - th) / 2 - bbox[1]
    d.text((tx, ty), name, fill=SIGN_TEXT, font=font)

    # Two shuttered windows flanking the door, below the sign.
    for wx in (34, FRAME_W - 34 - 28):
        d.rectangle([wx, 108, wx + 28, 108 + 34], fill=WINDOW_FRAME)
        d.rectangle([wx + 4, 112, wx + 24, 108 + 30], fill=WINDOW_GLASS)
        d.rectangle([wx + 4, 112, wx + 12, 108 + 30], fill=SHUTTER)

    # Door, centered, touching the frame's very bottom edge.
    door_w, door_h = 56, 88
    dx0 = (FRAME_W - door_w) / 2
    dy0 = FRAME_H - door_h
    d.rectangle([dx0 - 6, dy0 - 6, dx0 + door_w + 6, FRAME_H], fill=DOOR_FRAME)
    d.rectangle([dx0, dy0, dx0 + door_w, FRAME_H], fill=DOOR_WOOD)
    for band_y in (dy0 + 18, dy0 + 44, dy0 + 70):
        d.rectangle([dx0, band_y, dx0 + door_w, band_y + 5], fill=DOOR_BAND)
    d.ellipse([dx0 + door_w - 14, dy0 + 40, dx0 + door_w - 6, dy0 + 48], fill=(200, 180, 90))

    return img

frames = [build_frame(name) for name in NAMES]
sheet = Image.new('RGBA', (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
for i, frame in enumerate(frames):
    sheet.paste(frame, (i * FRAME_W, 0), frame)
sheet.save("${outPath}")
print(f"Wrote ${outPath} ({FRAME_W * len(frames)}x{FRAME_H}, {len(frames)} frames of {FRAME_W}x{FRAME_H})")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
