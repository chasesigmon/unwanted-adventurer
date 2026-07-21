// A later follow-up bug report: "the follower is supposed to get on the
// raft with the player. I bought a kitten, levelled it up to a cat, and
// then walked on the moat and the cat did not get on and could not cross
// with me." Root cause: shared/pets.ts's isFollowerBlockedByTerrain
// unconditionally OR'd in isMoatBlocked, with no canCrossWater exception
// -- even though computeFollowerStep's own caller already computes and
// passes canCrossWater (true while the owner has real flight or a
// qualifying boat, see shared/constants.ts's canFollowerCrossWater). This
// drives computeFollowerStep directly across the Grimoak Grounds moat's
// own mid-row crossing (away from the two bridges) to confirm a
// canCrossWater=true follower can now actually step onto moat tiles,
// while canCrossWater=false still correctly cannot (moat still blocks a
// follower with no flight/boat, same as a player with no boat/flight).
import { computeFollowerStep } from '../shared/pets.js';
import { MOAT_OUTER_LEFT, MOAT_INNER_LEFT, MOAT_OUTER_RIGHT, GRIMOAK_GROUNDS_MOAT_MID_ROW, isMoatBlocked } from '../shared/maps.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// The moat is only a RING around the castle building itself -- crossing
// it via boat means going from outside the OUTER edge to inside the INNER
// edge (a few tiles of water), not tunneling all the way through the
// castle to the opposite exterior side (a real, separate, and correctly
// still-blocked obstacle -- isCastleExteriorBlocked -- unrelated to this
// fix). So the target here sits just past the inner edge: enough to prove
// the full water ring was actually crossed, without needing to also route
// around the castle building.
const row = GRIMOAK_GROUNDS_MOAT_MID_ROW;
const startCol = MOAT_OUTER_LEFT - 3;
const targetCol = MOAT_INNER_LEFT + 2;
const current = { row, col: startCol };
const target = { row, col: targetCol };

// Sanity: confirm this row/col actually sits in the moat's own blocked
// band right at the outer edge, so the test is exercising the real bug.
check('sanity: the tile just inside the moat outer-left edge is really moat-blocked', isMoatBlocked('Grimoak Grounds', row, MOAT_OUTER_LEFT), 'test setup invalid otherwise');

// Walk the follower toward the target one step at a time (mirrors each
// manager's own tickAll loop) for enough iterations to reach the moat's
// edge and attempt to cross it.
function walk(canCrossWater, maxSteps) {
  let pos = { ...current };
  for (let i = 0; i < maxSteps; i++) {
    const step = computeFollowerStep(pos, target, 'Grimoak Grounds', canCrossWater);
    if (!step) break; // stuck -- both axes blocked
    pos = step;
  }
  return pos;
}

const stuckPos = walk(false, 200);
console.log('canCrossWater=false final position:', stuckPos, '(expected to stall right at the moat outer edge)');
check('without canCrossWater, the follower never enters the moat water at all', stuckPos.col < MOAT_OUTER_LEFT, `stuckPos.col=${stuckPos.col} MOAT_OUTER_LEFT=${MOAT_OUTER_LEFT}`);

const crossedPos = walk(true, 200);
console.log('canCrossWater=true final position:', crossedPos, '(expected to cross the full water ring, the actual bug fix)');
check(
  'with canCrossWater=true (owner has flight/qualifying boat), the follower now crosses the full moat water ring and reaches the inner edge',
  crossedPos.col >= MOAT_INNER_LEFT,
  `crossedPos.col=${crossedPos.col} MOAT_INNER_LEFT=${MOAT_INNER_LEFT}`
);

process.exit(failures > 0 ? 1 : 0);
