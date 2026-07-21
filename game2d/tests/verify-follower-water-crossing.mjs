// Items 9 & 16 (the duplicate): "The druid transformed into falcon with a
// tamed dire wolf — the dire wolf could walk on water, which shouldn't be
// allowed. Same for any non-flying pets/animated dead/summons. Only flying
// creatures or those given flight by the flight spell should cross
// water." Confirms shared/constants.ts's own canFollowerCrossWater
// directly against the exact reported scenario, plus the two other
// qualifying paths ("flying creatures" by kind, and "given flight by the
// flight spell" — real flightActive/wispActive, not a beast transform).
import { canFollowerCrossWater } from '../shared/constants.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const noFlight = { flightActive: false, wispActive: false, beastTransformActive: false, beastTransformKind: null };

// The exact reported bug: owner personally shapeshifted into a falcon
// (a beast transform, not real magical flight) with a tamed dire wolf.
const ownerTransformedIntoFalcon = { flightActive: false, wispActive: false, beastTransformActive: true, beastTransformKind: 'falcon' };
check(
  'a non-flying tamed beast (dire wolf) CANNOT cross water just because the owner shapeshifted into a falcon',
  canFollowerCrossWater('dire wolf', ownerTransformedIntoFalcon, false) === false
);

// "Only flying creatures... should cross water" — a follower that's
// itself an inherently flying kind crosses regardless of owner state.
check(
  'a tamed falcon CAN cross water on its own merit, even with no owner flight at all',
  canFollowerCrossWater('falcon', noFlight, false) === true
);
check(
  'a tamed crystal wyvern CAN cross water on its own merit',
  canFollowerCrossWater('crystal wyvern', noFlight, false) === true
);

// "...or those given flight by the flight spell" — real flightActive
// (the Flight spell) still carries a non-flying follower across.
const ownerHasRealFlight = { ...noFlight, flightActive: true };
check(
  'a non-flying pet CAN cross water when the owner has real Flight spell active',
  canFollowerCrossWater('puppy', ownerHasRealFlight, false) === true
);

// Wisp Transformation (also real magical flight, not a shapeshift) still
// carries a non-flying follower across too.
const ownerHasWisp = { ...noFlight, wispActive: true };
check(
  'a non-flying animated monster CAN cross water when the owner has Wisp Transformation active',
  canFollowerCrossWater('goblin', ownerHasWisp, false) === true
);

// A qualifying boat still carries any follower regardless of flight.
check('a non-flying follower CAN cross water via a qualifying boat', canFollowerCrossWater('dire wolf', noFlight, true) === true);

// Baseline: no flight, no boat, non-flying kind -> blocked.
check('a non-flying follower with no boat and no owner flight CANNOT cross water', canFollowerCrossWater('dire wolf', noFlight, false) === false);

process.exit(failures > 0 ? 1 : 0);
