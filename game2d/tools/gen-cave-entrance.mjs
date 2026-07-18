// One-time pixel-art generator for the Hexstone Cavern cave-mouth
// entrance (a later follow-up ask: "make a nice looking cave sprite
// entrance and there should not be a door, the player should walk
// through the cave entrance"). A single static rocky-mound image with a
// dark archway opening touching the frame's own bottom edge — the same
// "walk into the sprite's own doorway, no separate door sprite" shape
// every other structure sprite in this project already uses (see
// tools/gen-gobbler-hut-assets.mjs) — reused unscaled at BOTH ends of the
// connection (Great Plains' own side and Hexstone Cavern's own side).
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
from PIL import Image, ImageDraw

W, H = 160, 160

ROCK_DARK = (58, 54, 62)
ROCK_MID = (84, 78, 88)
ROCK_LIGHT = (112, 104, 116)
ROCK_HIGHLIGHT = (140, 130, 142)
MOSS = (74, 94, 62)
ARCH_SHADOW = (30, 26, 34)
CAVE_BLACK = (10, 9, 12)
CAVE_GLOW = (60, 50, 40)

random.seed(11)
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# The rocky mound itself — an irregular hill silhouette built from
# overlapping rounded blobs so the outline reads as natural stone, not a
# geometric building.
def blob(cx, cy, rx, ry, color):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)

blob(80, 118, 78, 62, ROCK_DARK)
blob(38, 128, 40, 40, ROCK_MID)
blob(122, 126, 42, 38, ROCK_MID)
blob(80, 96, 60, 48, ROCK_MID)
blob(55, 88, 34, 30, ROCK_LIGHT)
blob(105, 92, 32, 28, ROCK_LIGHT)
blob(80, 76, 30, 24, ROCK_HIGHLIGHT)

# A few scattered darker cracks/shadow patches and moss for texture —
# "nice looking," not a flat-shaded blob. Each center is checked against
# the mound drawn so far (getpixel's own alpha) and re-rolled if it lands
# somewhere the big blobs above never actually reached — otherwise a
# crack can end up as an isolated speck floating in transparent space
# that's still technically inside the outer silhouette mask below.
def on_mound(x, y):
    return img.getpixel((x, y))[3] > 0

def placed_on_mound(min_x, max_x, min_y, max_y):
    for _ in range(30):
        x = random.randint(min_x, max_x)
        y = random.randint(min_y, max_y)
        if on_mound(x, y):
            return x, y
    return None

for _ in range(14):
    pos = placed_on_mound(10, W - 10, 50, H - 10)
    if not pos:
        continue
    x, y = pos
    r = random.randint(3, 8)
    d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=ROCK_DARK)
for _ in range(6):
    pos = placed_on_mound(15, W - 15, 60, H - 15)
    if not pos:
        continue
    x, y = pos
    r = random.randint(4, 9)
    d.ellipse([x - r, y - r * 0.5, x + r, y + r * 0.5], fill=MOSS)

# The cave mouth itself — a rounded archway, dark interior, touching the
# frame's own bottom edge so walking onto this tile IS walking through
# the doorway (no separate door sprite, matching every other structure
# sprite's own convention).
arch_w, arch_h = 66, 92
ax0 = W // 2 - arch_w // 2
ax1 = ax0 + arch_w
ay0 = H - arch_h
d.rectangle([ax0 - 6, ay0 + 20, ax1 + 6, H - 1], fill=ARCH_SHADOW)
d.pieslice([ax0 - 6, ay0 - 6, ax1 + 6, ay0 + 40], 180, 360, fill=ARCH_SHADOW)
d.rectangle([ax0, ay0 + 20, ax1, H - 1], fill=CAVE_BLACK)
d.pieslice([ax0, ay0, ax1, ay0 + 46], 180, 360, fill=CAVE_BLACK)
# A faint warm glow deep in the opening, hinting at depth rather than a
# flat black hole.
gx0, gx1 = ax0 + 14, ax1 - 14
d.ellipse([gx0, ay0 + 40, gx1, ay0 + 70], fill=CAVE_GLOW)

# Crop everything drawn above back to a rounded silhouette that never
# exceeds the frame — applied LAST so the cracks/moss/archway all get
# clipped consistently rather than floating outside the mound's own edge.
mask = Image.new('L', (W, H), 0)
md = ImageDraw.Draw(mask)
md.ellipse([2, 40, W - 2, H + 40], fill=255)
img.putalpha(Image.composite(img.split()[3], Image.new('L', (W, H), 0), mask))

img.save("${outPath}")
print(f"Wrote ${outPath} ({W}x{H})")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
