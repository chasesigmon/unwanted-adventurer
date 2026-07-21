// Item 30: "Lesser elemental/evolved form should do RANGED magical damage
// (currently attacks physically); should evolve into 'elemental' at
// level 5 (same pattern for young griffin→griffin, young phoenix→
// phoenix); all evolved forms need new/enhanced sprites." Confirms the
// shared config directly: griffin/elemental/phoenix are now evolvable,
// their evolved names are the grown-form names (not the old self-mapping
// placeholders), and only the elemental gets the new ranged+magical
// attack treatment.
import { EVOLVABLE_PET_KINDS, PET_EVOLVED_NAME, PET_ATTACK_RANGE_TILES, PET_MAGICAL_ATTACK_KINDS } from '../shared/pets.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

for (const kind of ['griffin', 'elemental', 'phoenix']) {
  check(`${kind} is now in EVOLVABLE_PET_KINDS`, (EVOLVABLE_PET_KINDS).includes(kind), JSON.stringify(EVOLVABLE_PET_KINDS));
}

check('griffin evolves into "Griffin" (not the old "Young Griffin" self-mapping placeholder)', PET_EVOLVED_NAME.griffin === 'Griffin', PET_EVOLVED_NAME.griffin);
check('elemental evolves into "Elemental"', PET_EVOLVED_NAME.elemental === 'Elemental', PET_EVOLVED_NAME.elemental);
check('phoenix evolves into "Phoenix"', PET_EVOLVED_NAME.phoenix === 'Phoenix', PET_EVOLVED_NAME.phoenix);
// The original 3 kinds' own evolved names must be untouched by this change.
check('puppy still evolves into "Dog" (unrelated, unaffected)', PET_EVOLVED_NAME.puppy === 'Dog', PET_EVOLVED_NAME.puppy);

check('the elemental has a ranged attack (PET_ATTACK_RANGE_TILES.elemental > 1)', (PET_ATTACK_RANGE_TILES.elemental ?? 1) > 1, JSON.stringify(PET_ATTACK_RANGE_TILES));
check('griffin has NO special range entry (still ordinary melee)', PET_ATTACK_RANGE_TILES.griffin === undefined);
check('phoenix has NO special range entry (still ordinary melee)', PET_ATTACK_RANGE_TILES.phoenix === undefined);

check('only the elemental is a magical attacker', JSON.stringify([...PET_MAGICAL_ATTACK_KINDS].sort()) === JSON.stringify(['elemental']), JSON.stringify(PET_MAGICAL_ATTACK_KINDS));

process.exit(failures > 0 ? 1 : 0);
