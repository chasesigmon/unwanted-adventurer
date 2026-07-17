// One-time setup for item 4: "Add about 10 dummy players scattered across
// grimoak grounds at different levels from 8 to 20 of different
// specializations." Creates 10 real accounts/characters (per the user's
// explicit choice: real logged-in players, not decorative NPCs, so PvP
// and every other player-facing mechanic works against them normally),
// scattered across Grimoak Grounds' two open bands (north of the moat,
// rows 0-26; south of it, rows 63-79 — the moat+castle rectangle occupies
// rows 27-62/cols 3-77, see shared/maps.ts's MOAT_OUTER_* constants).
// Levels 8/9 stay unspecialized (below SPECIALIZATION_LEVEL_REQUIREMENT,
// 10); the other 8 each get a distinct specialization. Credentials are
// fixed/deterministic (not random) so scripts/dummy-players-bot.mjs can
// log into the exact same accounts on every run.
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const PASSWORD = 'dummyplayer123';

export const DUMMY_PLAYERS = [
  { name: 'Skarn', level: 8, specialization: null, row: 8, col: 12 },
  { name: 'Voltris', level: 9, specialization: null, row: 15, col: 30 },
  { name: 'Grimhale', level: 12, specialization: 'shaman', row: 20, col: 50 },
  { name: 'Ashcroft', level: 13, specialization: 'elementalist', row: 10, col: 70 },
  { name: 'Nightbrook', level: 14, specialization: 'summoner', row: 18, col: 90 },
  { name: 'Thornquist', level: 15, specialization: 'illusionist', row: 70, col: 15 },
  { name: 'Ravenmoor', level: 16, specialization: 'battlemage', row: 65, col: 35 },
  { name: 'Emberlyn', level: 18, specialization: 'cleric', row: 75, col: 55 },
  { name: 'Duskrider', level: 19, specialization: 'druid', row: 68, col: 75 },
  { name: 'Frostwyn', level: 20, specialization: 'diabolist', row: 72, col: 92 },
];

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('POST ' + path + ' failed: ' + JSON.stringify(json));
  return json;
}
function psql(sql) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
}

// Only runs the setup when invoked directly (`node tests/setup-dummy-players.mjs`),
// not when imported by the bot script for its DUMMY_PLAYERS list.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const dp of DUMMY_PLAYERS) {
    const uname = 'Dummy' + dp.name;
    const email = uname.toLowerCase() + '@example.com';
    try {
      const { token: accountToken } = await post('/auth/register', { username: uname, email, password: PASSWORD });
      await post('/characters', { name: dp.name, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
      console.log(`created ${dp.name} (account ${uname})`);
    } catch (err) {
      console.log(`skipping ${dp.name} (already exists?): ${err.message}`);
    }
    const specClause = dp.specialization ? `specialization='${dp.specialization}'` : `specialization=NULL`;
    psql(
      `UPDATE players SET map='Grimoak Grounds', "row"=${dp.row}, col=${dp.col}, level=${dp.level}, ${specClause} WHERE username='${dp.name}';`
    );
  }
  console.log('\nAll dummy players created/positioned.');
}
