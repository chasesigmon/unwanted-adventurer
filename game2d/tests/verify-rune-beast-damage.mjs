// Item 18: "A level-15 rune beast only did 5 damage to a level-20 tamed
// dire wolf — too low, should scale off a level-based formula; rune
// beasts should have 15 strength (add a strength stat to monsters)."
// Root cause (confirmed via a research pass over monster-manager.service.ts):
// the monster-vs-follower damage path used a flat MONSTER_VS_FOLLOWER_DAMAGE
// constant (5), completely ignoring the attacking monster's own level/
// attackDamage/strength. Fixed by reusing monster.attackDamage (falling
// back to monsterAttackDamageForLevel) — the SAME value already used
// against a player — instead of the flat constant, and by adding a
// species-level strength override (rune beast: 15).
import { MONSTER_SPECIES } from '../server/monsters/monster.js';
import { monsterAttackDamageForLevel, monsterAttributeForLevel } from '../server/combat/formulas.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const runeBeast = MONSTER_SPECIES.find((s) => s.kind === 'rune beast');
check('rune beast species entry exists', runeBeast !== undefined);

if (runeBeast) {
  check('rune beast is level 15', runeBeast.level === 15, `level=${runeBeast.level}`);
  check('rune beast has an explicit strength of 15 (not the generic level+1=16)', runeBeast.strength === 15, `strength=${runeBeast.strength}`);
  const expectedDamage = monsterAttackDamageForLevel(15);
  check(
    `rune beast attackDamage is the real level-based formula (${expectedDamage}), not a flat 5`,
    runeBeast.attackDamage === expectedDamage && runeBeast.attackDamage !== 5,
    `attackDamage=${runeBeast.attackDamage}, expected=${expectedDamage}`
  );
  check('the level-based formula value is meaningfully higher than the old flat 5', (runeBeast.attackDamage ?? 0) > 5, `attackDamage=${runeBeast.attackDamage}`);
}

// Sanity: the generic per-level attribute a species WITHOUT an override
// would get, for comparison against rune beast's explicit 15.
console.log('generic monsterAttributeForLevel(15) (what rune beast would have gotten without the override):', monsterAttributeForLevel(15));

process.exit(failures > 0 ? 1 : 0);
