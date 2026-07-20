// Smoke test for items 1/3 (diagonal movement, 0.5 mv cost) and item 11
// (Druid Transform spell + tamedBeastKinds tracking). Run with
// `node tests/verify-diagonal-move-and-transform.mjs` against the live
// dev server — requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'DiagTr' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Dtchartest' + ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'pipe' });
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
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

function emit(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, (res) => resolve(res)));
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(
  `UPDATE players SET map='Great Plains', "row"=10, col=10, mv=100, max_mv=100, level=10, specialization='druid', mana=500, max_mana=500, skills='{\\"punch\\":100,\\"tame beast\\":100,\\"transform\\":100}' WHERE username='${CHAR}';`
);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));

// --- Item 1/3: diagonal move + 0.5 mv cost ---
const before = await emit(socket, 'moveDiagonal', { dRow: -1, dCol: -1 }); // northwest
check('moveDiagonal ok', before.ok === true, before.message);
if (before.ok) {
  check('diagonal move went to (9,9) from (10,10)', before.player.row === 9 && before.player.col === 9, `got (${before.player.row},${before.player.col})`);
  check('mv cost is 0.5', before.player.mv === 99.5, `mv=${before.player.mv}`);
}

// --- Item 11: tame a beast, confirm tracking, then transform ---
psql(`UPDATE players SET mv=100 WHERE username='${CHAR}';`); // reset for cleanliness
// Directly seed tamedBeastKinds (bypassing the need for a live monster in range).
psql(`UPDATE players SET tamed_beast_kinds='[\\"wolf\\"]' WHERE username='${CHAR}';`);
socket.disconnect();
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));

const badTransform = await emit(socket2, 'castTransform', { kind: 'bear' });
check('cannot transform into a kind never tamed', badTransform.ok === false);

let sawTransformedSnapshot = false;
socket2.on('sync', (payload) => {
  if (payload.player?.beastTransformActive && payload.player.beastTransformKind === 'wolf') sawTransformedSnapshot = true;
});
const goodTransform = await emit(socket2, 'castTransform', { kind: 'wolf' });
check('castTransform ok for a tamed kind', goodTransform.ok === true, goodTransform.message);
await new Promise((r) => setTimeout(r, 500));
check('own sync snapshot reflects beastTransformActive=true, kind=wolf', sawTransformedSnapshot);

const rangedWhileTransformed = await emit(socket2, 'engageRangedAttack', { targetKind: 'monster', targetId: 'nonexistent' });
check('ranged wand attack blocked while transformed', rangedWhileTransformed.ok === false && /transformed/.test(rangedWhileTransformed.message ?? ''));

process.exit(failures > 0 ? 1 : 0);
