// Verifies the 10-item batch from this session: starting MV=100, the new
// Armor vs Physical/Armor vs Magical split (present on the player snapshot
// and non-zero from base stats/cloth armor bonus), the new Direfell world
// (1-tile Kortho connection, dire wolves at level 20/200hp), and Great
// Plains bears (level 20/200hp). Signs/canoe/cave-sprite/specialization
// level gate are visual/static-data changes checked separately (screenshot
// + grep), not worth a socket round-trip here.
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Batch10' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Bten' + randomLetters(8);

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

function waitForMapState(socket, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const handler = (data) => {
      socket.off('map:state', handler);
      resolve(data);
    };
    socket.on('map:state', handler);
    setTimeout(() => {
      socket.off('map:state', handler);
      resolve(null);
    }, timeoutMs);
  });
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));

// --- Item 5: starting MV = 100 ---
check('starting mv is 100', latestSync?.mv === 100);
console.log('mv:', latestSync?.mv);

// --- Item 4: armorVsPhysical / armorVsMagical present and non-zero ---
check('armorVsPhysical present and > 0', typeof latestSync?.armorVsPhysical === 'number' && latestSync.armorVsPhysical > 0);
check('armorVsMagical present and > 0', typeof latestSync?.armorVsMagical === 'number' && latestSync.armorVsMagical > 0);
console.log('armorVsPhysical:', latestSync?.armorVsPhysical, 'armorVsMagical:', latestSync?.armorVsMagical);
check('armorClass field removed', latestSync?.armorClass === undefined);

// --- Item 7: Kortho -> Direfell (1-tile exit at KORTHO_DIREFELL_ROW=15, col=KORTHO_COLS-1=105) ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
// col 104 sits on Kortho's far sand strip (103-105), just short of the
// col-105 exit tile itself — cols 53-102 are open water (The Shimmering
// Sea), which is intentionally impassable on foot (needs the raft/canoe),
// so start past it rather than testing the sea-crossing mechanic here.
psql(`UPDATE players SET map='Kortho', "row"=15, col=104 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));
console.log('start:', latestSync?.map, latestSync?.row, latestSync?.col);

let enteredDirefell = false;
let mapState = null;
for (let i = 0; i < 8 && !enteredDirefell; i++) {
  const ack = await move(socket, 'east');
  if (ack?.player) latestSync = ack.player;
  if (!ack.ok) {
    console.log('move east blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
  if (latestSync?.map === 'Direfell') enteredDirefell = true;
}
console.log('after walking east:', latestSync?.map, latestSync?.row, latestSync?.col);
check('walked from Kortho into Direfell', enteredDirefell);

if (enteredDirefell) {
  mapState = await waitForMapState(socket);
  if (!mapState) {
    socket.emit('move', 'south', () => {});
    await new Promise((r) => setTimeout(r, 300));
    mapState = await waitForMapState(socket, 1500);
  }
  const direWolves = (mapState?.monsters ?? []).filter((m) => m.kind === 'dire wolf');
  check('dire wolves present in Direfell', direWolves.length > 0);
  if (direWolves.length > 0) {
    check('dire wolf level is 20', direWolves[0].level === 20);
    check('dire wolf maxHp is 200', direWolves[0].maxHp === 200);
    console.log('sample dire wolf:', direWolves[0]);
  }

  // Walk back west to confirm the reciprocal connection.
  let backInKortho = false;
  for (let i = 0; i < 8 && !backInKortho; i++) {
    const ack = await move(socket, 'west');
    if (ack?.player) latestSync = ack.player;
    if (!ack.ok) break;
    await new Promise((r) => setTimeout(r, 200));
    if (latestSync?.map === 'Kortho') backInKortho = true;
  }
  check('walked from Direfell back into Kortho', backInKortho);
}

// --- Item 10: Great Plains bears (level 20/200hp) ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Great Plains', "row"=40, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
let gpMapState = null;
socket.on('map:state', (data) => (gpMapState = data));
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 1500));
const bears = (gpMapState?.monsters ?? []).filter((m) => m.kind === 'bear');
check('bears present in Great Plains', bears.length > 0);
if (bears.length > 0) {
  check('bear level is 20', bears[0].level === 20);
  check('bear maxHp is 200', bears[0].maxHp === 200);
  console.log('sample bear:', bears[0]);
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
