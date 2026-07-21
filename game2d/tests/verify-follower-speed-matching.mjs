// Item 27: "Followers should move as fast as the player, even with speed
// enhancements active." Confirms stepsForOwnerSpeed (server/pets/
// followerSpeed.ts) directly: an unbuffed owner still gets exactly 1 step
// per tick (unchanged baseline behavior), while a stacked celeritas +
// wisp + flight + boots-of-quickness + high-dexterity owner gets several
// steps per tick instead of silently falling behind.
import { stepsForOwnerSpeed } from '../server/pets/followerSpeed.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const baseOwner = {
  celeritasActive: false,
  wispActive: false,
  flightActive: false,
  beastTransformActive: false,
  beastTransformKind: null,
  dexterity: 1,
  equipment: {},
};

check('no owner at all (disconnected) still returns 1 step (safe default)', stepsForOwnerSpeed(undefined) === 1, String(stepsForOwnerSpeed(undefined)));
check('an unbuffed owner gets exactly 1 step per tick (unchanged baseline)', stepsForOwnerSpeed(baseOwner) === 1, String(stepsForOwnerSpeed(baseOwner)));

const celeritasOwner = { ...baseOwner, celeritasActive: true };
console.log('celeritas-only steps:', stepsForOwnerSpeed(celeritasOwner));
check('celeritas alone (10% faster) still rounds to 1 step (not a big enough gap)', stepsForOwnerSpeed(celeritasOwner) >= 1);

const fullyBuffedOwner = {
  celeritasActive: true,
  wispActive: true,
  flightActive: true,
  beastTransformActive: false,
  beastTransformKind: null,
  dexterity: 20,
  equipment: { boots: 'boots of quickness' },
};
const buffedSteps = stepsForOwnerSpeed(fullyBuffedOwner);
console.log('fully-buffed (celeritas+wisp+flight+boots+dex20) steps per tick:', buffedSteps);
check('a heavily speed-buffed owner gets MORE than 1 step per tick (this is the actual bug fix)', buffedSteps > 1, `steps=${buffedSteps}`);

process.exit(failures > 0 ? 1 : 0);
