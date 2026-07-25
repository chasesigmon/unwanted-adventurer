// Item 22 (part 2): "the cooldown should be honored even through a refresh
// or logout/login" — client.data.skillCooldowns used to be wiped to {}
// unconditionally on every handleConnection (see game.gateway.ts's own old
// "never persisted" comment). Now it's read back from a new `skill_cooldowns`
// jsonb column (player.entity.ts) and written on every startSkillCooldown
// call (game.gateway.ts).
//
// This test casts Light (a real success-gated cast, not a raw SQL fake-out)
// to put it on its real 5-minute cooldown, disconnects (simulating a
// refresh/relogin), reconnects, and confirms the SAME cooldown timestamp
// comes back in the fresh 'sync' payload instead of being wiped.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}
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
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.once('sync', (data) => resolve({ socket, sync: data }));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const CHAR = 'Cd' + randomLetters(8);
const UNAME = ('Cd' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Guarantee a real successful cast: max skill (rollSpellSuccess always
// passes at 100%), full mana, and a wand equipped (hasSpellcastingImplement).
psql(`UPDATE players SET skills = skills || '{"light": 100}'::jsonb, mana=200, max_mana=200, equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);

const { socket: socket1 } = await connect(charToken);
const castAck = await new Promise((resolve, reject) => {
  socket1.timeout(5000).emit('castLucem', (err, res) => (err ? reject(err) : resolve(res)));
});
console.log('castLucem ack:', JSON.stringify(castAck));
check('the real cast succeeded (skill was forced to 100%)', castAck && castAck.ok === true, JSON.stringify(castAck));

const preDisconnectRow = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT skill_cooldowns FROM players WHERE username='${CHAR}';"`).toString().trim();
console.log('DB skill_cooldowns immediately after cast:', preDisconnectRow);
check('the DB column actually got a real light cooldown persisted (not empty {})', /"light"\s*:\s*\d+/.test(preDisconnectRow), preDisconnectRow);

socket1.close();
await new Promise((r) => setTimeout(r, 300));

// Reconnect — simulates a refresh/relogin. handleConnection should now read
// the persisted cooldown back instead of resetting to {}.
const { sync: reconnectSync } = await connect(charToken);
const cooldowns = reconnectSync?.player?.skillCooldowns ?? {};
console.log('skillCooldowns in the fresh sync payload after reconnect:', JSON.stringify(cooldowns));
check('light is still on cooldown in the very first sync after reconnecting', typeof cooldowns.light === 'number' && cooldowns.light > Date.now(), JSON.stringify(cooldowns));

reconnectSync && (await new Promise((r) => setTimeout(r, 200)));

psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);

process.exit(failures > 0 ? 1 : 0);
