// Item 28: "Kortho pets are supposed to fly — an elemental pet got stuck
// on water after losing flight mid-water." Root cause: canFollowerCrossWater
// only ever checked FLYING_MONSTER_KINDS (falcon/crystal wyvern, both
// MonsterKind values) -- a griffin/elemental/phoenix PET's own kind (a
// PetKind, a different string set) never matched, so it only crossed
// water because the OWNER happened to have real flight active at that
// moment; once that expired mid-water, the pet had no independent
// qualification. Confirms the fix: these 3 pet kinds now cross water on
// their own kind-based merit, with NO owner flight/boat needed at all.
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

for (const kind of ['griffin', 'elemental', 'phoenix']) {
  check(
    `a ${kind} pet crosses water on its own kind-based merit, with NO owner flight and NO boat`,
    canFollowerCrossWater(kind, noFlight, false) === true
  );
}

// A non-flying pet kind (puppy/kitten/piglet) still correctly requires
// the owner's own real flight or a boat -- this fix must not accidentally
// make EVERY pet fly.
check('a puppy (non-flying pet) still CANNOT cross water with no owner flight/boat', canFollowerCrossWater('puppy', noFlight, false) === false);
check('a puppy still CAN cross water via a qualifying boat (unaffected by this fix)', canFollowerCrossWater('puppy', noFlight, true) === true);

// The exact reported scenario: an elemental pet mid-water when the
// owner's OWN flight (not the pet's own kind) expires -- previously this
// flipped canCrossWater to false and stranded it; now it stays true
// regardless of the owner's own flight state.
const ownerLostFlight = noFlight; // flightActive/wispActive both false now
check(
  'an elemental pet does NOT get stranded when the owner loses their own flight mid-water (the exact reported bug)',
  canFollowerCrossWater('elemental', ownerLostFlight, false) === true
);

process.exit(failures > 0 ? 1 : 0);
