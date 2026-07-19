// Verifies Bramwick's 3 new connections: Brimstone Cave (west), Runestone
// Way/"Boulder Pass" (north, with real off-road boulder collision), and
// Silverbranch Road (east).
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'BramwickConn' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Bwchar' + randomLetters(8);

function psql(sql) {
  execFileSync('docker', ['exec', '-i', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', sql], { stdio: 'inherit' });
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

let failed = false;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failed = true;
}

async function move(socket, direction) {
  return new Promise((resolve) => socket.emit('move', direction, resolve));
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

let latestSync = null;

async function freshConnect(map, row, col) {
  psql(`UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${CHAR}';`);
  const { token } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(token);
  socket.on('sync', (data) => (latestSync = data.player));
  await new Promise((r) => setTimeout(r, 400));
  return socket;
}

// --- Brimstone Cave: west out of Bramwick, east back ---
let socket = await freshConnect('Bramwick', 20, 5);
console.log('start:', latestSync?.map, latestSync?.row, latestSync?.col);
let entered = false;
for (let i = 0; i < 8 && !entered; i++) {
  const ack = await move(socket, 'west');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move west blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 150));
  if (latestSync?.map === 'Brimstone Cave') entered = true;
}
check('walked from Bramwick into Brimstone Cave', entered);

if (entered) {
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  socket = await freshConnect('Brimstone Cave', 50, 90);
  let back = false;
  for (let i = 0; i < 12 && !back; i++) {
    const ack = await move(socket, 'east');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) break;
    await new Promise((r) => setTimeout(r, 150));
    if (latestSync?.map === 'Bramwick') back = true;
  }
  check('walked from Brimstone Cave back into Bramwick', back);
}

// --- Runestone Way: north out of Bramwick, confirm boulder collision off-road ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
socket = await freshConnect('Bramwick', 5, 36);
entered = false;
for (let i = 0; i < 8 && !entered; i++) {
  const ack = await move(socket, 'north');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move north blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 150));
  if (latestSync?.map === 'Runestone Way') entered = true;
}
check('walked from Bramwick into Runestone Way', entered);

if (entered) {
  console.log('in Runestone Way at:', latestSync?.row, latestSync?.col);
  // Try to walk off the road to the west — should be blocked by the
  // boulder-field collision (RUNESTONE_WAY_MID_COL=5, half-width=2, so
  // col 2 is the westmost walkable column; stepping further west should fail).
  let offRoadBlocked = false;
  for (let i = 0; i < 6; i++) {
    const ack = await move(socket, 'west');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) {
      offRoadBlocked = true;
      console.log('correctly blocked off-road at', latestSync?.row, latestSync?.col, ack.message);
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  check('blocked from walking off the road into the boulder field', offRoadBlocked);
}

// --- Silverbranch Road: east out of Bramwick, west back ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
socket = await freshConnect('Bramwick', 20, 35);
entered = false;
for (let i = 0; i < 8 && !entered; i++) {
  const ack = await move(socket, 'east');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move east blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 150));
  if (latestSync?.map === 'Silverbranch Road') entered = true;
}
check('walked from Bramwick into Silverbranch Road', entered);

if (entered) {
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  socket = await freshConnect('Silverbranch Road', 5, 5);
  let back = false;
  for (let i = 0; i < 8 && !back; i++) {
    const ack = await move(socket, 'west');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) break;
    await new Promise((r) => setTimeout(r, 150));
    if (latestSync?.map === 'Bramwick') back = true;
  }
  check('walked from Silverbranch Road back into Bramwick', back);
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
