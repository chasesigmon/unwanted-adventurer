// One-time pixel-art generator for the small canoe/large raft (a later
// follow-up ask: "Create a canoe and raft sprites and movement over water
// should make the canoe or raft turn in the direction the player is
// moving"). Each is its own 4-frame spritesheet — one frame per facing,
// in the SAME down/up/left/right row order src/characterSprites.ts's own
// ROW_INDEX uses — so WorldScene can pick a frame with
// `ROW_INDEX[facing]`, the exact same lookup already used for the
// player's own idle frame, rather than inventing a second frame-order
// convention. Delegates drawing to an inline Python (PIL) script, same
// "no Aseprite/pixel-mcp available here" convention every other generator
// in this project's tools/ uses.
//
// Run once with `node tools/gen-boat-assets.mjs` from game2d/ whenever
// the art needs regenerating.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const python = `
from PIL import Image, ImageDraw

FRAME = 48

CANOE_HULL = (120, 84, 46)
CANOE_HULL_DARK = (92, 62, 30)
CANOE_INTERIOR = (166, 128, 78)
RAFT_LOG = (128, 96, 60)
RAFT_LOG_DARK = (100, 74, 44)
RAFT_ROPE = (60, 44, 24)
FLAG_POLE = (70, 50, 28)
FLAG_CLOTH = (196, 58, 48)

FACING_DELTA = {'down': (0, 1), 'up': (0, -1), 'left': (-1, 0), 'right': (1, 0)}

def blank():
    return Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))

# A small red pennant planted at the BOW end, same marker on both hulls —
# an unambiguous "which way is this thing facing" cue that still reads at
# 48px, since the hull shapes themselves are symmetric fore-to-aft (a real
# canoe/raft silhouette barely differs bow vs stern at this scale).
def plant_flag(d, cx, cy, dx, dy, reach):
    tip_x, tip_y = cx + dx * reach, cy + dy * reach
    d.line([(cx, cy), (tip_x, tip_y)], fill=FLAG_POLE, width=2)
    if dx != 0:
        cloth = [(tip_x, tip_y - 5), (tip_x + dx * 8, tip_y), (tip_x, tip_y + 5)]
    else:
        cloth = [(tip_x - 5, tip_y), (tip_x, tip_y + dy * 8), (tip_x + 5, tip_y)]
    d.polygon(cloth, fill=FLAG_CLOTH)

# A slim, pointed-both-ends hull (a canoe) — symmetric fore-to-aft, so the
# bow-mounted flag above (plant_flag) is what actually shows facing.
def canoe_frame(facing):
    img = blank()
    d = ImageDraw.Draw(img)
    long_half = 18
    short_half = 8
    cx, cy = FRAME / 2, FRAME / 2
    dx, dy = FACING_DELTA[facing]
    if dx == 0:
        points = [(cx, cy + long_half * dy), (cx + short_half, cy), (cx, cy - long_half * dy), (cx - short_half, cy)]
        interior = [(cx, cy + long_half * dy * 0.55), (cx + short_half * 0.55, cy), (cx, cy - long_half * dy * 0.55), (cx - short_half * 0.55, cy)]
    else:
        points = [(cx + long_half * dx, cy), (cx, cy + short_half), (cx - long_half * dx, cy), (cx, cy - short_half)]
        interior = [(cx + long_half * dx * 0.55, cy), (cx, cy + short_half * 0.55), (cx - long_half * dx * 0.55, cy), (cx, cy - short_half * 0.55)]
    d.polygon(points, fill=CANOE_HULL_DARK)
    d.polygon(interior, fill=CANOE_INTERIOR)
    d.line(points + [points[0]], fill=CANOE_HULL, width=2)
    plant_flag(d, cx + long_half * dx * 0.7, cy + long_half * dy * 0.7, dx, dy, 10)
    return img

# A blocky, roughly-square log raft — the log grain always runs ACROSS
# the direction of travel (real raft construction: logs lashed side by
# side, perpendicular to the heading), plus the same bow flag as the
# canoe so facing is unambiguous even though the raft itself is square.
def raft_frame(facing):
    img = blank()
    d = ImageDraw.Draw(img)
    half = 18
    cx, cy = FRAME / 2, FRAME / 2
    dx, dy = FACING_DELTA[facing]
    d.rectangle([cx - half, cy - half, cx + half, cy + half], fill=RAFT_LOG_DARK)
    vertical = dx == 0
    log_w = 6
    if vertical:
        x = cx - half
        toggle = False
        while x < cx + half:
            color = RAFT_LOG if not toggle else RAFT_LOG_DARK
            d.rectangle([x, cy - half, min(x + log_w, cx + half), cy + half], fill=color)
            x += log_w
            toggle = not toggle
        d.line([(cx - half * 0.6, cy - half), (cx - half * 0.6, cy + half)], fill=RAFT_ROPE, width=2)
        d.line([(cx + half * 0.6, cy - half), (cx + half * 0.6, cy + half)], fill=RAFT_ROPE, width=2)
    else:
        y = cy - half
        toggle = False
        while y < cy + half:
            color = RAFT_LOG if not toggle else RAFT_LOG_DARK
            d.rectangle([cx - half, y, cx + half, min(y + log_w, cy + half)], fill=color)
            y += log_w
            toggle = not toggle
        d.line([(cx - half, cy - half * 0.6), (cx + half, cy - half * 0.6)], fill=RAFT_ROPE, width=2)
        d.line([(cx - half, cy + half * 0.6), (cx + half, cy + half * 0.6)], fill=RAFT_ROPE, width=2)
    plant_flag(d, cx + half * dx * 0.7, cy + half * dy * 0.7, dx, dy, 11)
    return img

FACINGS = ['down', 'up', 'left', 'right']

canoe_sheet = Image.new('RGBA', (FRAME * len(FACINGS), FRAME), (0, 0, 0, 0))
raft_sheet = Image.new('RGBA', (FRAME * len(FACINGS), FRAME), (0, 0, 0, 0))
for i, facing in enumerate(FACINGS):
    canoe_sheet.paste(canoe_frame(facing), (i * FRAME, 0))
    raft_sheet.paste(raft_frame(facing), (i * FRAME, 0))

canoe_sheet.save("${join(assetsDir, 'canoe-spritesheet.png')}")
raft_sheet.save("${join(assetsDir, 'raft-spritesheet.png')}")
print("Wrote canoe-spritesheet.png and raft-spritesheet.png (" + str(FRAME * len(FACINGS)) + "x" + str(FRAME) + ", 4 frames of " + str(FRAME) + "x" + str(FRAME) + " each)")
`;

execFileSync('python3', ['-c', python], { stdio: 'inherit' });
