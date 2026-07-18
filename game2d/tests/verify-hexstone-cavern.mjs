// Verifies the new Great Plains <-> Hexstone Cavern connection: walking
// west out of Great Plains' own NW exit lands in Hexstone Cavern, and
// walking south from Hexstone Cavern's own SE exit lands back in Great
// Plains.
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Hexstone' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Hxchar' + randomLetters(8);

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

// Great Plains' new west exit is a band centered on
// GREAT_PLAINS_HEXSTONE_ROW(15) at col 0 — start a few tiles east of it.
psql(`UPDATE players SET map='Great Plains', "row"=15, col=5 WHERE username='${CHAR}';`);
let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));
console.log('start:', latestSync?.map, latestSync?.row, latestSync?.col);

let enteredCavern = false;
for (let i = 0; i < 8 && !enteredCavern; i++) {
  const ack = await move(socket, 'west');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move west blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
  if (latestSync?.map === 'Hexstone Cavern') enteredCavern = true;
}
console.log('after walking west:', latestSync?.map, latestSync?.row, latestSync?.col);
check('walked from Great Plains into Hexstone Cavern', enteredCavern);

if (enteredCavern) {
  // Hexstone Cavern's own south exit sits at row=SIZE-1(99),
  // col=HEXSTONE_GREAT_PLAINS_COL(75) — reposition near it (disconnect
  // BEFORE the SQL reposition, never the reverse).
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  psql(`UPDATE players SET "row"=90, col=75 WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('sync', (data) => (latestSync = data.player));
  await new Promise((r) => setTimeout(r, 400));

  let enteredGreatPlains = false;
  for (let i = 0; i < 12 && !enteredGreatPlains; i++) {
    const ack = await move(socket, 'south');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) {
      console.log('move south blocked at', latestSync?.row, latestSync?.col, ack.message);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
    if (latestSync?.map === 'Great Plains') enteredGreatPlains = true;
  }
  console.log('after walking south:', latestSync?.map, latestSync?.row, latestSync?.col);
  check('walked from Hexstone Cavern back into Great Plains', enteredGreatPlains);
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
