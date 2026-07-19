// One-time pixel-art generator for the Hexstone Cavern cave-mouth
// entrance (a later follow-up ask: "make a nice looking cave sprite
// entrance and there should not be a door, the player should walk
// through the cave entrance"). A single static rocky-mound image with a
// dark archway opening touching the frame's own bottom edge — the same
// "walk into the sprite's own doorway, no separate door sprite" shape
// every other structure sprite in this project already uses (see
// tools/gen-gobbler-hut-assets.mjs) — reused unscaled at BOTH ends of the
// connection (Great Plains' own side and Hexstone Cavern's own side), and
// again for Bramwick <-> Brimstone Cave.
//
// Revised for a later follow-up ask: "improve the cave entrance sprites
// (make them look better)" — the original pass was a smooth, flat-shaded
// blob; this version adds directional lighting (upper-left highlight,
// lower-right shadow), a jagged (not perfectly round) silhouette, a
// voussoir stone arch trim framing the opening, hanging vines, loose
// rubble at the base, and a layered glow with a couple of faint crystal
// flecks deep in the dark for atmosphere. Frame size/anchor point are
// unchanged so it still lines up exactly where the old sprite did.
//
// Delegates drawing to an inline Python (PIL) script, same "no Aseprite/
// pixel-mcp available here" convention every other generator in this
// project's tools/ uses. Run once with `node tools/gen-cave-entrance.mjs`
// from game2d/ whenever the art needs regenerating.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'assets', 'cave-entrance.png');

const python = `
import random
import math
from PIL import Image, ImageDraw

W, H = 160, 160

ROCK_DARKEST = (40, 37, 44)
ROCK_DARK = (58, 54, 62)
ROCK_MID = (84, 78, 88)
ROCK_LIGHT = (112, 104, 116)
ROCK_HIGHLIGHT = (146, 136, 148)
ROCK_RIM = (168, 158, 170)
MOSS_DARK = (58, 76, 48)
MOSS = (82, 104, 66)
MOSS_LIGHT = (108, 130, 84)
VINE = (66, 90, 52)
ARCH_STONE_DARK = (36, 32, 40)
ARCH_STONE_LIGHT = (54, 48, 58)
ARCH_SHADOW = (26, 22, 30)
CAVE_BLACK = (9, 8, 11)
CAVE_MID = (22, 19, 24)
CAVE_GLOW = (86, 66, 40)
CAVE_GLOW_BRIGHT = (140, 104, 54)
EMBER = (214, 150, 70)
CRYSTAL = (120, 190, 200)

random.seed(11)
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def blob(cx, cy, rx, ry, color):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)

# The rocky mound's own silhouette, built in light->dark order so a later
# directional pass (below) can re-tint the whole thing without erasing the
# base shape. Slightly more layered/asymmetric than the original pass —
# a bigger, taller mound with a jagged crown instead of one smooth dome.
blob(80, 122, 82, 60, ROCK_DARK)
blob(34, 132, 42, 42, ROCK_MID)
blob(126, 130, 44, 40, ROCK_MID)
blob(80, 98, 64, 52, ROCK_MID)
blob(52, 84, 36, 34, ROCK_LIGHT)
blob(108, 88, 34, 30, ROCK_LIGHT)
blob(80, 70, 32, 28, ROCK_HIGHLIGHT)
blob(66, 58, 18, 16, ROCK_HIGHLIGHT)
blob(96, 60, 16, 15, ROCK_MID)

# A jagged crown along the top edge — a row of small overlapping triangular
# spikes instead of the smooth dome the ellipses alone would leave, so the
# outline reads as broken stone rather than a rounded hill.
def spike(cx, base_y, w, h, color):
    d.polygon([(cx - w, base_y), (cx, base_y - h), (cx + w, base_y)], fill=color)

spike_specs = [
    (30, 108, 10, 22, ROCK_MID), (46, 96, 9, 26, ROCK_LIGHT), (60, 84, 8, 22, ROCK_LIGHT),
    (74, 74, 9, 30, ROCK_HIGHLIGHT), (88, 70, 8, 26, ROCK_HIGHLIGHT), (102, 76, 9, 24, ROCK_LIGHT),
    (116, 88, 8, 20, ROCK_LIGHT), (130, 100, 9, 16, ROCK_MID),
]
for cx, by, w, h, col in spike_specs:
    spike(cx, by, w, h, col)

def on_mound(x, y):
    return img.getpixel((x, y))[3] > 0

def placed_on_mound(min_x, max_x, min_y, max_y):
    for _ in range(30):
        x = random.randint(min_x, max_x)
        y = random.randint(min_y, max_y)
        if on_mound(x, y):
            return x, y
    return None

# Cracks/shadow texture.
for _ in range(16):
    pos = placed_on_mound(10, W - 10, 45, H - 10)
    if not pos:
        continue
    x, y = pos
    r = random.randint(3, 8)
    d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=ROCK_DARKEST)

# Directional lighting pass: a soft highlight overlay on the upper-left
# face of the mound and a soft shadow overlay on the lower-right, so the
# rock reads as lit from one side instead of flat-shaded.
light = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(light)
ld.ellipse([10, 30, 95, 110], fill=(255, 250, 235, 46))
img.alpha_composite(light)

shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.ellipse([85, 70, 150, 150], fill=(0, 0, 0, 40))
img.alpha_composite(shadow)

# Moss patches, varied tone.
for _ in range(8):
    pos = placed_on_mound(15, W - 15, 55, H - 15)
    if not pos:
        continue
    x, y = pos
    r = random.randint(4, 10)
    tone = random.choice([MOSS_DARK, MOSS, MOSS_LIGHT])
    d.ellipse([x - r, y - r * 0.5, x + r, y + r * 0.5], fill=tone)

# The cave mouth itself — a rounded archway, dark interior, touching the
# frame's own bottom edge so walking onto this tile IS walking through
# the doorway (no separate door sprite, matching every other structure
# sprite's own convention).
arch_w, arch_h = 66, 94
ax0 = W // 2 - arch_w // 2
ax1 = ax0 + arch_w
ay0 = H - arch_h

# A ring of fitted stone blocks (voussoirs) framing the opening — drawn as
# a slightly larger arch shape in alternating stone tones, then the actual
# dark opening is punched on top of it, leaving a visible stone lip.
trim = 9
d.rectangle([ax0 - trim, ay0 + 22, ax1 + trim, H - 1], fill=ARCH_STONE_DARK)
d.pieslice([ax0 - trim, ay0 - trim, ax1 + trim, ay0 + 44], 180, 360, fill=ARCH_STONE_DARK)
# Individual block seams around the curve, alternating light/dark for a
# fitted-stone read rather than one flat trim color.
cx_arch, cy_arch = (ax0 + ax1) / 2, ay0 + 22
rx_arch, ry_arch = (ax1 - ax0) / 2 + trim, 22 + trim
for i, ang in enumerate(range(180, 361, 18)):
    rad = math.radians(ang)
    bx = cx_arch + rx_arch * math.cos(rad)
    by = cy_arch + ry_arch * math.sin(rad)
    tone = ARCH_STONE_LIGHT if i % 2 == 0 else ARCH_STONE_DARK
    d.ellipse([bx - 6, by - 6, bx + 6, by + 6], fill=tone)
# Straight side seams below the curve.
for y in range(ay0 + 22, H, 14):
    d.ellipse([ax0 - trim - 2, y - 4, ax0 - trim + 6, y + 4], fill=ARCH_STONE_LIGHT)
    d.ellipse([ax1 + trim - 6, y - 4, ax1 + trim + 2, y + 4], fill=ARCH_STONE_LIGHT)
# A keystone accent at the very top of the arch.
d.polygon([(cx_arch - 9, ay0 - trim + 6), (cx_arch + 9, ay0 - trim + 6), (cx_arch + 6, ay0 + 8), (cx_arch - 6, ay0 + 8)], fill=ARCH_STONE_LIGHT)

d.rectangle([ax0 - 6, ay0 + 20, ax1 + 6, H - 1], fill=ARCH_SHADOW)
d.pieslice([ax0 - 6, ay0 - 6, ax1 + 6, ay0 + 40], 180, 360, fill=ARCH_SHADOW)
d.rectangle([ax0, ay0 + 20, ax1, H - 1], fill=CAVE_BLACK)
d.pieslice([ax0, ay0, ax1, ay0 + 46], 180, 360, fill=CAVE_BLACK)

# A layered glow deep in the opening — several concentric, slightly
# offset ellipses fading from a near-black midtone up to a warm bright
# core, hinting at real depth rather than one flat glow ellipse.
gx0, gx1 = ax0 + 10, ax1 - 10
d.ellipse([gx0, ay0 + 34, gx1, ay0 + 78], fill=CAVE_MID)
d.ellipse([gx0 + 6, ay0 + 42, gx1 - 6, ay0 + 72], fill=CAVE_GLOW)
d.ellipse([gx0 + 14, ay0 + 50, gx1 - 14, ay0 + 66], fill=CAVE_GLOW_BRIGHT)

# A few faint embers/crystal flecks glinting in the dark, for a "nice
# looking," slightly inviting-but-ominous mouth rather than a flat hole.
ember_spots = [(cx_arch - 16, ay0 + 60), (cx_arch + 14, ay0 + 52), (cx_arch - 4, ay0 + 70)]
for i, (ex, ey) in enumerate(ember_spots):
    col = EMBER if i != 1 else CRYSTAL
    d.ellipse([ex - 2, ey - 2, ex + 2, ey + 2], fill=col)

# Hanging vines trailing down from the arch's outer edges into the rock.
for vx, vlen, vseed in [(ax0 - trim + 2, 24, 1), (ax1 + trim - 2, 18, 2), (ax0 + 6, 14, 3)]:
    random.seed(vseed)
    y = ay0 + 26
    x = vx
    for _ in range(vlen):
        x += random.choice([-1, 0, 0, 1])
        y += 1
        if 0 <= x < W and 0 <= y < H:
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=VINE)
random.seed(11)

# Loose rubble/boulders scattered at the base, in front of the mound.
for bx, by, br in [(24, 150, 9), (44, 156, 6), (118, 154, 8), (138, 148, 7), (16, 138, 6)]:
    d.ellipse([bx - br, by - br * 0.7, bx + br, by + br * 0.7], fill=ROCK_MID)
    d.ellipse([bx - br + 2, by - br * 0.5, bx + br - 3, by - 1], fill=ROCK_LIGHT)

# A thin bright rim-light along the mound's upper-left silhouette edge —
# cheap but effective "lit from one side" cue pixel art relies on heavily.
rim = Image.new('RGBA', (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(rim)
rd.arc([2, 26, 150, 150], 200, 300, fill=ROCK_RIM, width=3)
img.alpha_composite(rim)

# Crop everything drawn above back to a rounded silhouette that never
# exceeds the frame — applied LAST so the cracks/moss/archway/rubble all
# get clipped consistently rather than floating outside the mound's own
# edge.
mask = Image.new('L', (W, H), 0)
md = ImageDraw.Draw(mask)
md.ellipse([0, 36, W, H + 44], fill=255)
for cx, by, w, h in [(s[0], s[1], s[2] + 4, s[3] + 4) for s in spike_specs]:
    md.polygon([(cx - w, by), (cx, by - h), (cx + w, by)], fill=255)
for bx, by, br in [(24, 150, 9), (44, 156, 6), (118, 154, 8), (138, 148, 7), (16, 138, 6)]:
    md.ellipse([bx - br - 2, by - br, bx + br + 2, by + br], fill=255)
img.putalpha(Image.composite(img.split()[3], Image.new('L', (W, H), 0), mask))

img.save("${outPath}")
print(f"Wrote ${outPath} ({W}x{H})")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
