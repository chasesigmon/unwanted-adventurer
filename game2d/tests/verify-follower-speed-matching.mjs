// Item 27/originally, then a later follow-up bug report: "the followers
// still don't match speed, just with haste activated my battlemage was
// able to outrun the pet cat." The original stepsForOwnerSpeed used
// Math.round(BASE_MOVE_COOLDOWN_MS / cooldown), which rounds any single
// modest buff (celeritas alone ~10% faster, wisp/flight alone ~20%)
// straight back down to 1 step/tick -- identical to unbuffed, so a
// follower only ever sped up once several buffs stacked past a 1.5x
// ratio. The fix replaces that with a per-follower fractional
// accumulator (stepsForOwnerSpeed now takes an id first) that carries the
// remainder tick to tick, so a modest buff nets an extra step every few
// ticks instead of never. This test drives many ticks and checks the
// TOTAL step count over that window reflects the buff proportionally,
// rather than asserting a single call's rounded result.
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

check('no owner at all (disconnected) still returns 1 step (safe default)', stepsForOwnerSpeed('no-owner', undefined) === 1, String(stepsForOwnerSpeed('no-owner', undefined)));

let unbuffedTotal = 0;
for (let i = 0; i < 20; i++) unbuffedTotal += stepsForOwnerSpeed('unbuffed-owner', baseOwner);
check('an unbuffed owner gets exactly 1 step per tick over 20 ticks (unchanged baseline)', unbuffedTotal === 20, `total=${unbuffedTotal}`);

// This is the exact bug report: celeritas ALONE (no stacking with
// wisp/flight/boots/dex) should still net a real speedup over enough
// ticks, not silently round back down to the unbuffed baseline forever.
const celeritasOwner = { ...baseOwner, celeritasActive: true };
let celeritasTotal = 0;
const TICKS = 20;
for (let i = 0; i < TICKS; i++) celeritasTotal += stepsForOwnerSpeed('celeritas-owner', celeritasOwner);
console.log(`celeritas-only steps over ${TICKS} ticks:`, celeritasTotal);
check('celeritas alone nets MORE total steps than an unbuffed owner over the same 20 ticks (the actual bug fix)', celeritasTotal > TICKS, `total=${celeritasTotal}`);

const fullyBuffedOwner = {
  celeritasActive: true,
  wispActive: true,
  flightActive: true,
  beastTransformActive: false,
  beastTransformKind: null,
  dexterity: 20,
  equipment: { boots: 'boots of quickness' },
};
let buffedTotal = 0;
for (let i = 0; i < TICKS; i++) buffedTotal += stepsForOwnerSpeed('fully-buffed-owner', fullyBuffedOwner);
console.log(`fully-buffed (celeritas+wisp+flight+boots+dex20) steps over ${TICKS} ticks:`, buffedTotal);
check('a heavily speed-buffed owner nets even more total steps than celeritas alone', buffedTotal > celeritasTotal, `buffed=${buffedTotal} celeritas=${celeritasTotal}`);

// Different ids must carry fully independent accumulators (a pet and an
// animated monster on the same buffed owner shouldn't share/clobber state).
let idATotal = 0;
let idBTotal = 0;
for (let i = 0; i < TICKS; i++) {
  idATotal += stepsForOwnerSpeed('independent-a', celeritasOwner);
  idBTotal += stepsForOwnerSpeed('independent-b', celeritasOwner);
}
check('two distinct follower ids accumulate identically but independently', idATotal === idBTotal, `a=${idATotal} b=${idBTotal}`);

process.exit(failures > 0 ? 1 : 0);
