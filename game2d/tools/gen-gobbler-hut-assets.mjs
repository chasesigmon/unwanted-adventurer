// One-time pixel-art generator for Gobbler Village's 3 hut buildings (a
// later follow-up ask: "make it like a small village structure with huts
// to go into"). Same "one real building per door" idea as Bramwick's
// cottages/Kortho's shops, but deliberately smaller and cruder — log
// walls and a conical thatch roof instead of a proper timber-framed
// building — to read as a primitive village rather than a town shopfront.
// No name banner (these are plain dwellings, not labeled shops).
//
// Delegates drawing to an inline Python (PIL) script, same convention as
// tools/gen-kortho-shop-assets.mjs. Run once with
// `node tools/gen-gobbler-hut-assets.mjs` from game2d/ whenever the art
// needs regenerating.
//
// Frame size is smaller than Bramwick/Kortho's 192x256 (6x8 tiles) — 4x5
// tiles (128x160px) fits "small huts" — one frame per GOBBLER_VILLAGE_HUT_MAPS
// entry, in that exact order, so WorldScene's own
// frame = GOBBLER_VILLAGE_HUT_MAPS.indexOf(hutMapName) convention (mirroring
// Bramwick's cottageSprites) lines up. The 3 frames vary their thatch/log
// tint slightly so the village doesn't look like 3 identical clones.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'assets', 'gobbler-hut-spritesheet.png');

const python = `
import random
from PIL import Image, ImageDraw

FRAME_W, FRAME_H = 128, 160

LOG_TINTS = [(120, 86, 52), (108, 90, 48), (128, 96, 60)]
THATCH_TINTS = [(168, 132, 62), (176, 140, 70), (160, 126, 58)]

LOG_DARK_DELTA = -26
LOG_LIGHT_DELTA = 18
THATCH_DARK_DELTA = -22
THATCH_LIGHT_DELTA = 16
DOOR_WOOD = (58, 40, 22)
DOOR_FRAME = (34, 22, 12)
DOOR_BAND = (26, 16, 8)
POST_COLOR = (70, 50, 28)

def shade(color, delta):
    return tuple(max(0, min(255, c + delta)) for c in color)

def conical_roof(draw, apex_y, base_y, left, right, tint):
    width = right - left
    height = base_y - apex_y
    for row in range(height):
        y = apex_y + row
        half = (row / height) * (width / 2)
        rx0 = int(left + width / 2 - half)
        rx1 = int(left + width / 2 + half)
        band = shade(tint, THATCH_DARK_DELTA) if row % 5 < 2 else shade(tint, THATCH_LIGHT_DELTA if row % 5 == 2 else 0)
        draw.rectangle([rx0, y, rx1, y + 1], fill=band)
    # ragged eave overhang, slightly wider than the wall
    draw.rectangle([left - 10, base_y - 3, right + 10, base_y + 3], fill=shade(tint, THATCH_DARK_DELTA))
    for x in range(left - 10, right + 10, 6):
        draw.rectangle([x, base_y + 1, x + 3, base_y + 5], fill=shade(tint, THATCH_DARK_DELTA))

def log_wall(draw, x0, y0, x1, y1, tint):
    draw.rectangle([x0, y0, x1, y1], fill=tint)
    log_h = 8
    y = y0
    row = 0
    while y < y1:
        color = shade(tint, LOG_LIGHT_DELTA if row % 2 == 0 else LOG_DARK_DELTA)
        draw.rectangle([x0, y, x1, min(y + log_h - 2, y1)], fill=color)
        draw.rectangle([x0, min(y + log_h - 2, y1), x1, min(y + log_h, y1)], fill=shade(tint, LOG_DARK_DELTA))
        y += log_h
        row += 1
    # corner posts
    draw.rectangle([x0, y0, x0 + 5, y1], fill=POST_COLOR)
    draw.rectangle([x1 - 5, y0, x1, y1], fill=POST_COLOR)

def build_frame(seed, log_tint, thatch_tint):
    random.seed(seed)
    img = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Conical thatch roof, rows ~4-64.
    conical_roof(d, apex_y=4, base_y=64, left=8, right=FRAME_W - 8, tint=thatch_tint)

    # Log wall body, rows 62-159 (touches the frame's own bottom edge —
    # same "no separate door sprite" convention as Bramwick/Kortho).
    log_wall(d, 10, 62, FRAME_W - 10, FRAME_H - 1, log_tint)

    # Round-topped door, centered, touching the bottom edge.
    door_w, door_h = 32, 62
    door_x0 = FRAME_W // 2 - door_w // 2
    door_x1 = door_x0 + door_w
    door_y0 = FRAME_H - door_h
    d.rectangle([door_x0 - 3, door_y0 - 3, door_x1 + 3, FRAME_H - 1], fill=DOOR_FRAME)
    d.pieslice([door_x0 - 3, door_y0 - 3, door_x1 + 3, door_y0 + door_w], 180, 360, fill=DOOR_FRAME)
    d.rectangle([door_x0, door_y0, door_x1, FRAME_H - 1], fill=DOOR_WOOD)
    d.pieslice([door_x0, door_y0, door_x1, door_y0 + door_w], 180, 360, fill=DOOR_WOOD)
    for bx in range(door_y0 + 10, FRAME_H - 6, 14):
        d.rectangle([door_x0 + 2, bx, door_x1 - 2, bx + 3], fill=DOOR_BAND)
    d.ellipse([door_x1 - 10, door_y0 + door_h // 2, door_x1 - 5, door_y0 + door_h // 2 + 5], fill=(20, 14, 6))

    return img

frames = []
for i in range(3):
    frames.append(build_frame(11 + i, LOG_TINTS[i], THATCH_TINTS[i]))

sheet = Image.new('RGBA', (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
for i, frame in enumerate(frames):
    sheet.paste(frame, (i * FRAME_W, 0), frame)
sheet.save("${outPath}")
print(f"Wrote ${outPath} ({FRAME_W * len(frames)}x{FRAME_H}, {len(frames)} frame(s) of {FRAME_W}x{FRAME_H})")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
