// Live verification for item 9: Bramwick's standing torches should block
// movement (players go around them). Places the player directly south
// of one of the side torches (row 14, col 5) and attempts to move north
// onto it.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'TorchTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Torchtest' + rand2() + rand2();

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
  // Torch at (14, 5) — place the player one tile south (15, 5) and try
  // moving north onto it.
  psql(`UPDATE players SET "row"=15, col=5, map='Bramwick' WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 500));

  const moveAck = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  console.log('move onto torch tile ack:', JSON.stringify(moveAck));
  check('moving onto a standing torch tile is blocked', moveAck.ok === false);
  check('player did not actually move', moveAck.player?.row === 15 || moveAck.player === undefined);

  // Sanity: moving somewhere else (a couple tiles east, clear ground)
  // should still work fine — confirms this isn't a blanket movement bug.
  const clearMoveAck = await new Promise((resolve) => socket.emit('move', 'east', resolve));
  console.log('move to clear ground ack:', JSON.stringify(clearMoveAck));
  check('moving to clear ground still works', clearMoveAck.ok === true);

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
