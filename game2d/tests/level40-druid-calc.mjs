// A one-off calculator for item 19: "give me a level 40 druid player with
// all stats (hp/mana/mv) & trains & practices that player would have
// earned through levelling up to that point naturally in game." Reuses
// the REAL exported leveling formulas (Monte-Carlo averaged, since
// perLevelVitalGain has genuine randomness per level) rather than
// hand-deriving the expected value. Not a live character creation script
// (see this file's own note in the batch summary) — purely computes the
// numbers to report.
import {
  perLevelVitalGain,
  HP_PER_CONSTITUTION,
  MANA_PER_INTELLIGENCE,
  STARTING_VITAL,
  TRAINING_POINT_LEVEL_INTERVAL,
  PRACTICE_POINTS_PER_LEVEL,
  STARTING_PRACTICE_POINTS,
  STARTING_TRAINING_POINTS,
} from '../server/combat/formulas.js';

const STARTING_ATTR = 5;
// A suggested, reasonable allocation for a level 40 Druid (not the only
// valid one — trains are the player's own choice): the 3 starting points
// into wisdom (the druid's own flavor stat), then the 8 post-creation
// 5-level grants split across constitution (survivability) and
// intelligence (mana pool + spell scaling), 4 apiece.
const grantOrder = ['constitution', 'intelligence', 'constitution', 'intelligence', 'constitution', 'intelligence', 'constitution', 'intelligence'];

function simulateOnce() {
  let constitution = STARTING_ATTR;
  let intelligence = STARTING_ATTR;
  let hp = STARTING_VITAL;
  let mana = STARTING_VITAL;
  for (let level = 2; level <= 40; level++) {
    if (level % TRAINING_POINT_LEVEL_INTERVAL === 0) {
      const stat = grantOrder[level / TRAINING_POINT_LEVEL_INTERVAL - 1];
      if (stat === 'constitution') {
        constitution += 1;
        hp += HP_PER_CONSTITUTION;
      } else {
        intelligence += 1;
        mana += MANA_PER_INTELLIGENCE;
      }
    }
    hp += perLevelVitalGain(constitution);
    mana += perLevelVitalGain(intelligence);
  }
  return { hp, mana, constitution, intelligence };
}

const N = 20000;
let hpSum = 0;
let manaSum = 0;
let last;
for (let i = 0; i < N; i++) {
  const r = simulateOnce();
  hpSum += r.hp;
  manaSum += r.mana;
  last = r;
}
console.log('Average maxHp at level 40:', Math.round(hpSum / N));
console.log('Average maxMana at level 40:', Math.round(manaSum / N));
console.log('Final constitution:', last.constitution, '(started at 5, +4 trains)');
console.log('Final intelligence:', last.intelligence, '(started at 5, +4 trains)');
console.log('Wisdom: 8 (started at 5, +3 starting trains)');
console.log('Strength/Dexterity/Luck: 5 (untouched baseline)');
console.log('mv: 100 (mv never grows per level — no formula wires level/stats into it)');
console.log('Total training points earned by level 40 (3 starting + 8 grants):', STARTING_TRAINING_POINTS + 40 / TRAINING_POINT_LEVEL_INTERVAL);
console.log('Total practice points earned by level 40 (5 starting + 39 level-ups * 3):', STARTING_PRACTICE_POINTS + PRACTICE_POINTS_PER_LEVEL * 39);
