// A later follow-up ask: "make sure ranged vs physical damage is
// balanced." Root cause: the wand bolt's own basic ranged attack used
// scaledSpellDamage's compounding 1.1^intelligence curve -- the same
// formula every NAMED spell's own damage uses -- while melee's own
// baseDamage() scales purely linearly with strength. At equal invested
// stat points this let ranged noticeably out-damage melee, growing wider
// at higher levels since one side is exponential and the other linear.
// The fix (wandBoltBaseDamage in server/combat/formulas.ts) gives the
// wand bolt the exact same linear shape baseDamage() already uses for
// melee, just driven by intelligence instead of strength.
import { baseDamage, wandBoltBaseDamage, scaledSpellDamage, applyArmorMitigation } from '../server/combat/formulas.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const WAND_BOLT_DAMAGE = 9;
const K = 16; // applyArmorMitigation's own curve constant

function compare(level, stat, armor) {
  const melee = Math.round(applyArmorMitigation(baseDamage(stat, level), armor));
  const rangedOld = Math.round(applyArmorMitigation(scaledSpellDamage(WAND_BOLT_DAMAGE, level, stat), armor));
  const rangedNew = Math.round(applyArmorMitigation(wandBoltBaseDamage(WAND_BOLT_DAMAGE, stat, level), armor));
  return { melee, rangedOld, rangedNew };
}

// The exact scenario research measured the imbalance at: level 20, stat
// 20, a modest armor of 2.
const mid = compare(20, 20, 2);
console.log('level 20 / stat 20 / armor 2:', JSON.stringify(mid));
check('the OLD compounding formula was wildly unbalanced (confirms the reported bug existed)', mid.rangedOld > mid.melee * 2, `melee=${mid.melee} rangedOld=${mid.rangedOld}`);
check('the NEW linear formula is now close to melee (within a small, constant, non-growing gap)', Math.abs(mid.rangedNew - mid.melee) <= 5, `melee=${mid.melee} rangedNew=${mid.rangedNew}`);

// Confirm the gap stays roughly CONSTANT (not growing) across levels --
// the whole point of switching from exponential to linear scaling.
const low = compare(1, 10, 2);
const high = compare(40, 30, 2);
const gapLow = low.rangedNew - low.melee;
const gapMid = mid.rangedNew - mid.melee;
const gapHigh = high.rangedNew - high.melee;
console.log('gaps at level 1/20/40:', gapLow, gapMid, gapHigh);
check('the ranged-vs-melee gap stays roughly constant across the level range (linear parity, not runaway growth)', Math.max(gapLow, gapMid, gapHigh) - Math.min(gapLow, gapMid, gapHigh) <= 4, `gaps=${gapLow},${gapMid},${gapHigh}`);

// Named spells (fireball, arcane bolt, elemental bolts, ...) must be
// COMPLETELY unaffected -- scaledSpellDamage itself was never touched.
const spellDamageUnchanged = scaledSpellDamage(10, 20, 20) === 10 * Math.pow(1.1, 20) * (1 + 20 * 0.02);
check('scaledSpellDamage (used by every named spell) is completely unchanged', spellDamageUnchanged);

process.exit(failures > 0 ? 1 : 0);
