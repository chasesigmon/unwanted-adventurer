// Two follow-up asks bundled together for Runestone Canyon:
// - "reduce the size of runestone canyon by half" (RUNESTONE_CANYON_ROWS/
//   COLS halved independently of Grimoak Grounds' own size).
// - "make it so that the boulders/rocks on the left and right of the
//   stairs can't be walked on" -- isRunestoneCanyonBoulderBlocked, wired
//   into both WorldManagerService.isOccupied (players) and
//   MonsterManagerService.isFree (monsters/dwellers). Deliberately
//   narrower than the whole rim: the existing "walk around the entire
//   canyon in a circle" route (north/east/west rim) must stay open --
//   only the south rim (where the stairs cut through) gets blocked
//   outside the stairs' own column band.
import {
  RUNESTONE_CANYON_ROWS,
  RUNESTONE_CANYON_COLS,
  RUNESTONE_CANYON_MID_COL,
  RUNESTONE_CANYON_RIM_WIDTH_TILES,
  RUNESTONE_CANYON_STAIRS_HALF_WIDTH_TILES,
  isRunestoneCanyonBoulderBlocked,
  isRunestoneCanyonStairsTile,
} from '../shared/maps.js';
import { GRIMOAK_GROUNDS_ROWS, GRIMOAK_GROUNDS_COLS } from '../shared/maps.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

console.log('Runestone Canyon size:', RUNESTONE_CANYON_ROWS, 'x', RUNESTONE_CANYON_COLS, '| Grimoak Grounds:', GRIMOAK_GROUNDS_ROWS, 'x', GRIMOAK_GROUNDS_COLS);
check('Runestone Canyon rows are half of Grimoak Grounds rows', RUNESTONE_CANYON_ROWS === Math.round(GRIMOAK_GROUNDS_ROWS / 2), `got ${RUNESTONE_CANYON_ROWS}`);
check('Runestone Canyon cols are half of Grimoak Grounds cols', RUNESTONE_CANYON_COLS === Math.round(GRIMOAK_GROUNDS_COLS / 2), `got ${RUNESTONE_CANYON_COLS}`);
check('the canyon still has a meaningful open floor inside the rim after halving', RUNESTONE_CANYON_ROWS - 2 * RUNESTONE_CANYON_RIM_WIDTH_TILES > 10, `inner rows=${RUNESTONE_CANYON_ROWS - 2 * RUNESTONE_CANYON_RIM_WIDTH_TILES}`);

const southRimRow = RUNESTONE_CANYON_ROWS - 1;
const stairsCol = RUNESTONE_CANYON_MID_COL;
const boulderColLeft = RUNESTONE_CANYON_MID_COL - RUNESTONE_CANYON_STAIRS_HALF_WIDTH_TILES - 1;
const boulderColRight = RUNESTONE_CANYON_MID_COL + RUNESTONE_CANYON_STAIRS_HALF_WIDTH_TILES + 1;

check('the stairs tile itself is walkable (not boulder-blocked)', isRunestoneCanyonStairsTile('Runestone Canyon', southRimRow, stairsCol) && !isRunestoneCanyonBoulderBlocked('Runestone Canyon', southRimRow, stairsCol));
check('the boulder just left of the stairs is blocked', isRunestoneCanyonBoulderBlocked('Runestone Canyon', southRimRow, boulderColLeft));
check('the boulder just right of the stairs is blocked', isRunestoneCanyonBoulderBlocked('Runestone Canyon', southRimRow, boulderColRight));

// The north rim (opposite side from the stairs) must stay fully walkable --
// this is the existing "walk around the entire canyon in a circle" route,
// and must not be broken by the new boulder check.
check('the north rim (opposite the stairs) stays walkable -- the walk-around-the-canyon route is preserved', !isRunestoneCanyonBoulderBlocked('Runestone Canyon', 0, RUNESTONE_CANYON_MID_COL));
check('the east rim stays walkable', !isRunestoneCanyonBoulderBlocked('Runestone Canyon', Math.floor(RUNESTONE_CANYON_ROWS / 2), RUNESTONE_CANYON_COLS - 1));
check('the west rim stays walkable', !isRunestoneCanyonBoulderBlocked('Runestone Canyon', Math.floor(RUNESTONE_CANYON_ROWS / 2), 0));

// Other maps must never be affected by this check.
check('a different map is never boulder-blocked', !isRunestoneCanyonBoulderBlocked('Runestone Way', southRimRow, boulderColLeft));

process.exit(failures > 0 ? 1 : 0);
