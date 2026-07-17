// Live verification for item 4: cast wisp transformation, confirm it's
// on cooldown, then cast it AGAIN while still a wisp — should cancel
// (bypassing the cooldown) rather than being rejected as "still
// recharging." A third cast (now back to normal form, still on
// cooldown) should correctly be rejected.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'WispTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Wisptest' + rand2() + rand2();

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
  psql(
    `UPDATE players SET equipment='{"weapon":"wand"}', skills='{"wisp transformation": 100}', specialization='druid', mana=200, max_mana=200 WHERE username='${CHAR}';`
  );
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestPlayer = null;
  socket.on('sync', (data) => {
    if (data.player) latestPlayer = data.player;
  });
  await new Promise((r) => setTimeout(r, 500));

  const castAck = await new Promise((resolve) => socket.emit('castWispTransformation', resolve));
  console.log('1st cast (transform) ack:', JSON.stringify(castAck));
  check('transformed into a wisp', castAck.ok);
  await new Promise((r) => setTimeout(r, 200));
  check('wispActive is true', latestPlayer?.wispActive === true);

  const cancelAck = await new Promise((resolve) => socket.emit('castWispTransformation', resolve));
  console.log('2nd cast (cancel, mid-cooldown) ack:', JSON.stringify(cancelAck));
  check('cancel succeeded even though on cooldown', cancelAck.ok === true && !/recharging/.test(cancelAck.message ?? ''));
  await new Promise((r) => setTimeout(r, 200));
  check('wispActive is now false', latestPlayer?.wispActive === false);

  const retransformAck = await new Promise((resolve) => socket.emit('castWispTransformation', resolve));
  console.log('3rd cast (re-transform, still on cooldown) ack:', JSON.stringify(retransformAck));
  check('re-transforming while still on cooldown is correctly rejected', retransformAck.ok === false && /recharging/.test(retransformAck.message ?? ''));

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
