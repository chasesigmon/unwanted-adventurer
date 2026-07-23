// A later follow-up ask: "Battlemage is a special class/specialization
// that does not require a wand to cast spells. They have learned to cast
// spells without a wand or while holding weapons." Every spell-cast
// handler (and the wand's own ranged auto-attack) individually gated on
// isWandItem(client.data.equipment.weapon), with no shared helper to hook
// a specialization exception into -- refactored into a single
// hasSpellcastingImplement(client) helper (game.gateway.ts), which OR's
// in `client.data.specialization === 'battlemage'`, then swapped into
// all ~28 call sites.
//
// This drives a real castLucem call (the light spell -- no target, no
// mana-cost edge cases to juggle, just needs LIGHT_SKILL learned) against
// two characters with NO wand equipped: a battlemage (should succeed) and
// an ordinary human with no specialization (should be rejected with the
// same "you need a wand" message as before).
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
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res)));
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

async function makeCharacter(prefix, specialization) {
  const UNAME = (prefix + randomLetters(8)).slice(0, 16);
  const CHAR = prefix + randomLetters(8);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  const specSql = specialization ? `specialization='${specialization}', ` : '';
  psql(`UPDATE players SET ${specSql}skills='{"light": 50}'::jsonb, equipment='{}'::jsonb WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  return { UNAME, CHAR, charToken };
}

const battlemage = await makeCharacter('Bm', 'battlemage');
const ordinary = await makeCharacter('Or', null);

const bmSocket = await connect(battlemage.charToken);
const bmAck = await emit(bmSocket, 'castLucem', undefined);
console.log('battlemage (no wand) castLucem ack:', JSON.stringify(bmAck));
check('a battlemage with NO wand equipped CAN cast a spell', bmAck.ok === true, JSON.stringify(bmAck));
bmSocket.close();

const orSocket = await connect(ordinary.charToken);
const orAck = await emit(orSocket, 'castLucem', undefined);
console.log('ordinary human (no wand) castLucem ack:', JSON.stringify(orAck));
check('an ordinary (non-battlemage) character with NO wand is still rejected', orAck.ok === false && /wand/i.test(orAck.message ?? ''), JSON.stringify(orAck));
orSocket.close();

for (const { CHAR, UNAME } of [battlemage, ordinary]) {
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

process.exit(failures > 0 ? 1 : 0);
