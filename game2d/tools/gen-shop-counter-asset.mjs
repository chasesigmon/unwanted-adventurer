// One-time pixel-art generator for the shop counter every Floro/Kortho
// vendor now stands behind (a later follow-up ask: "the shopkeepers...
// should be behind the desk... make the desks wider, but not as tall") —
// a real low-profile counter, distinct from (and NOT a stretched copy of)
// classroom-desk.png, which was designed for a single teacher's desk, not
// a shop counter. Same PIL/python3 inline-script convention this
// project's other hand-generated sprites use.
//
// Run once with `node tools/gen-shop-counter-asset.mjs` from game2d/
// whenever the art needs regenerating.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'assets', 'shop-counter.png');

const python = `
from PIL import Image, ImageDraw

W, H = 160, 44
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

TOP = (168, 122, 66)
TOP_EDGE = (120, 84, 42)
FRONT = (94, 62, 34)
FRONT_DARK = (70, 46, 24)
LEG = (54, 34, 18)

# Countertop overhang across the full width.
d.rectangle([0, 0, W - 1, 9], fill=TOP)
d.rectangle([0, 9, W - 1, 12], fill=TOP_EDGE)

# Front panel, inset slightly from the counter's own overhanging edge.
d.rectangle([4, 12, W - 5, H - 8], fill=FRONT)
for x in range(10, W - 10, 18):
    d.rectangle([x, 15, x + 2, H - 11], fill=FRONT_DARK)

# Two short legs/base at the bottom corners.
d.rectangle([4, H - 8, 14, H - 1], fill=LEG)
d.rectangle([W - 15, H - 8, W - 5, H - 1], fill=LEG)

img.save("${outPath}")
print(f"Wrote ${outPath} ({W}x{H})")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
