// Item 10 (of the "block followers from solid obstacles" family): "don't
// allow pets/followers to walk through non-accessible areas (e.g. through
// the castle at Grimoak Grounds to reach the player around the moat)."
// computeFollowerStep previously only ever checked isWaterBlocked, so a
// follower cut straight through the castle's own solid footprint in a
// perfectly straight line. Confirms directly against shared/pets.ts's
// computeFollowerStep and shared/maps.ts's isCastleExteriorBlocked/
// isWaterBlocked that: (a) the castle's interior tiles are genuinely
// blocked terrain but NOT water (proving the old water-only check would
// have let a follower walk straight through), and (b) computeFollowerStep
// itself now never returns a candidate tile inside the castle's footprint,
// instead detouring around it via the other axis when one is available.
import { computeFollowerStep } from '../shared/pets.js';
import { isCastleExteriorBlocked, isWaterBlocked } from '../shared/maps.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const MAP = 'Grimoak Grounds';

// The castle's own footprint (CASTLE_DOOR_ON_GROUNDS = {row:55,col:40},
// width 60, height 21) spans roughly rows 34-55, cols 10-70. Row 45, col
// 10-70 sits squarely inside it.
check(
  'row 45 col 40 (deep inside the castle footprint) is genuinely blocked terrain',
  isCastleExteriorBlocked(MAP, 45, 40) === true
);
check(
  'that same tile is NOT water (proving the old water-only check would have let a follower walk straight through it)',
  isWaterBlocked(MAP, 45, 40) === false
);

// A follower directly west of the castle, told to reach a target directly
// east of it (with a slight row offset so a detour axis actually exists)
// — the straight-line path crosses the castle's interior.
const current = { row: 45, col: 5 };
const target = { row: 46, col: 75 };

// Walk it forward for up to 80 ticks (well more than the ~65-tile
// distance) and confirm computeFollowerStep NEVER returns a step landing
// inside the castle's blocked footprint, at any point along the way.
let pos = { ...current };
let everInsideCastle = false;
let steppedAtAll = false;
for (let i = 0; i < 80; i++) {
  const step = computeFollowerStep(pos, target, MAP, false);
  if (!step) break; // stuck (both axes blocked) -- acceptable, just not cutting through
  steppedAtAll = true;
  if (isCastleExteriorBlocked(MAP, step.row, step.col)) {
    everInsideCastle = true;
    break;
  }
  pos = step;
}

check('the follower actually moved at some point (test setup sanity check)', steppedAtAll);
check('computeFollowerStep never stepped the follower onto a castle-blocked tile while routing toward the far side', !everInsideCastle, JSON.stringify(pos));

process.exit(failures > 0 ? 1 : 0);
