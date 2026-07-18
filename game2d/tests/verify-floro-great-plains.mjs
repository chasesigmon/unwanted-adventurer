// Verifies the new Floro <-> Great Plains connection: walking west out
// of Floro lands in Great Plains, and walking east from Great Plains'
// own NE exit lands back in Floro.
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FloroGP' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Fgpchar' + randomLetters(8);

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

async function move(socket, direction, getLatest) {
  const ack = await new Promise((resolve) => socket.emit('move', direction, resolve));
  return ack;
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

// Floro's own new west exit is a band centered on FLORO_GREAT_PLAINS_ROW
// (TOWN_MID_ROW=25) at col 0 — start a few tiles east of it, clear of
// every shop door (all at cols 10-40).
psql(`UPDATE players SET map='Floro', "row"=25, col=5 WHERE username='${CHAR}';`);
let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));
console.log('start:', latestSync?.map, latestSync?.row, latestSync?.col);

let enteredGreatPlains = false;
for (let i = 0; i < 8 && !enteredGreatPlains; i++) {
  const ack = await move(socket, 'west');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move west blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
  if (latestSync?.map === 'Great Plains') enteredGreatPlains = true;
}
console.log('after walking west:', latestSync?.map, latestSync?.row, latestSync?.col);
check('walked from Floro into Great Plains', enteredGreatPlains);

if (enteredGreatPlains) {
  // Great Plains' own NE exit sits at row=GREAT_PLAINS_FLORO_ROW(15),
  // col=GREAT_PLAINS_SIZE-1(99) — reposition near it (disconnect BEFORE
  // the SQL reposition, never the reverse, so handleDisconnect's own
  // async persistPosition can't clobber the teleport).
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  psql(`UPDATE players SET "row"=15, col=90 WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('sync', (data) => (latestSync = data.player));
  await new Promise((r) => setTimeout(r, 400));

  let enteredFloro = false;
  for (let i = 0; i < 12 && !enteredFloro; i++) {
    const ack = await move(socket, 'east');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) {
      console.log('move east blocked at', latestSync?.row, latestSync?.col, ack.message);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
    if (latestSync?.map === 'Floro') enteredFloro = true;
  }
  console.log('after walking east:', latestSync?.map, latestSync?.row, latestSync?.col);
  check('walked from Great Plains back into Floro', enteredFloro);
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
