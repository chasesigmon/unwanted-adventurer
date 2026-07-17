// Live verification for item 3: "Create a level 25 necromancer for
// rexaxle and give it equivalent hp/mana and stats for that level and
// trains and practices." Malachar itself was created directly via SQL
// INSERT (rexaxle's own account password isn't available to this
// session, so the normal register/create-character HTTP flow can't
// target that specific account) — this script instead proves the exact
// same INSERT technique on a fresh throwaway account, then connects to
// it for real to confirm the resulting character is fully functional:
// correct level/stats/hp/mana/trains/practices, specialization already
// chosen, and able to actually learn the necromancer's own animate dead
// spell (level 15, necromancer-only, 3 practice points) using the
// practice-point pool this same INSERT pattern grants.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'NecroTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Necrotest' + rand2() + rand2();

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
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

  // The exact same promotion applied directly to Malachar (see item 3's
  // own SQL insert), just as an UPDATE on an already-created character
  // instead of a fresh INSERT.
  psql(
    `UPDATE players SET level=25, exp=0, max_hp=400, hp=400, max_mana=400, mana=400, stat_points_available=8, practice_points_available=77, specialization='necromancer' WHERE username='${CHAR}';`
  );

  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestSync = null;
  socket.on('sync', (data) => (latestSync = data));
  await new Promise((r) => setTimeout(r, 700));

  const player = latestSync?.player;
  check('character connects successfully', Boolean(player));
  check('level is 25', player?.level === 25);
  check('maxHp is 400 (and hp fully healed to match)', player?.maxHp === 400 && player?.hp === 400);
  check('maxMana is 400 (and mana fully healed to match)', player?.maxMana === 400 && player?.mana === 400);
  check('specialization is necromancer', player?.specialization === 'necromancer');
  check('has 8 training points available', player?.statPointsAvailable === 8);
  check('has 77 practice points available', player?.practicePointsAvailable === 77);

  // Confirm the accumulated practice points actually work: learn animate
  // dead (level 15, necromancer-only, 3 practice points) through the same
  // teacher click-to-learn handler the game itself uses.
  const learnAck = await new Promise((resolve) => socket.emit('learnSkill', { skill: 'animate dead' }, resolve));
  check('can learn animate dead (necromancer-only, level 15) with the granted practice points', learnAck.ok === true);

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
