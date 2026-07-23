// A later follow-up ask: "similar to hp & mana, as a player levels their
// MV should increase on level by a random amount between 4 and 8." MV had
// never grown past its starting value before this (game.gateway.ts's
// grantExp only ever bumped maxHp/maxMana per level). perLevelMvGain
// (server/combat/formulas.ts) is the new uniform-random 4-8 roll, wired
// into the SAME per-level loop hp/mana already use.
import { perLevelMvGain, PER_LEVEL_MV_GAIN_MIN, PER_LEVEL_MV_GAIN_MAX } from '../server/combat/formulas.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

check('PER_LEVEL_MV_GAIN_MIN is 4', PER_LEVEL_MV_GAIN_MIN === 4, `got ${PER_LEVEL_MV_GAIN_MIN}`);
check('PER_LEVEL_MV_GAIN_MAX is 8', PER_LEVEL_MV_GAIN_MAX === 8, `got ${PER_LEVEL_MV_GAIN_MAX}`);

const rolls = Array.from({ length: 2000 }, () => perLevelMvGain());
const allInRange = rolls.every((r) => r >= 4 && r <= 8 && Number.isInteger(r));
check('every roll is an integer in [4, 8]', allInRange, `min=${Math.min(...rolls)} max=${Math.max(...rolls)}`);

const distinctValues = new Set(rolls);
check('rolls actually cover the full range (not stuck on one value)', distinctValues.size === 5, `got distinct values: ${[...distinctValues].sort().join(',')}`);

process.exit(failures > 0 ? 1 : 0);
