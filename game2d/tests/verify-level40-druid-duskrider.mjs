// Item 13: "create the level 40 druid for me based on the stat sheet."
// tests/level40-druid-calc.mjs already computed the stat sheet (Monte-
// Carlo averaged maxHp/maxMana over the real perLevelVitalGain formula);
// this script applies it to a live account and verifies the result.
// The user chose to bump the existing "Duskrider" dummy druid (level 19,
// flat placeholder 10s) to level 40 in place, rather than create a new
// account or touch the OTHER existing druid dummy ("Thessaly").
//
// Run with `node tests/verify-level40-druid-duskrider.mjs` — requires the
// Postgres container to be up (docker exec game2d-postgres psql ...).
import { execSync } from 'child_process';

const sql = `
UPDATE players SET
  level = 40,
  strength = 5,
  dexterity = 5,
  luck = 5,
  constitution = 9,
  intelligence = 9,
  wisdom = 8,
  hp = 673,
  max_hp = 673,
  mana = 628,
  max_mana = 628,
  mv = 100,
  max_mv = 100,
  exp = 0,
  stat_points_available = 0,
  practice_points_available = 122
WHERE username = 'Duskrider'
RETURNING username, level, strength, intelligence, wisdom, dexterity, constitution, luck, hp, max_hp, mana, max_mana, mv, max_mv, stat_points_available, practice_points_available;
`;

const out = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/\n/g, ' ')}"`, { encoding: 'utf8' });
console.log(out);

const expected = { level: '40', hp: '673', max_hp: '673', mana: '628', max_mana: '628', mv: '100', max_mv: '100' };
for (const [key, value] of Object.entries(expected)) {
  if (!out.includes(value)) {
    console.error(`FAIL: expected ${key}=${value} in output`);
    process.exitCode = 1;
  }
}
if (process.exitCode !== 1) console.log('PASS: Duskrider is now a level 40 druid matching the computed stat sheet.');
