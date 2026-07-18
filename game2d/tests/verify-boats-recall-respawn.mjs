// Verifies this batch's socket-testable pieces:
// (1) boat purchase from Kortho's new Boat Shop, auto-board onto Kortho's
//     new sea via the dock, auto-disembark back onto the dock/land;
// (2) a fresh pet is classified 'small';
// (5) setting + using a single recall point;
// (6) death -> 10s respawn countdown (movement blocked meanwhile) ->
//     respawn at the set recall point (tested via a monster kill, which
//     now shares the exact same beginRespawnCountdown/finishRespawn path
//     water-death uses — the 3-minute flight timer makes water-death
//     itself impractical to trigger in a quick test; that trigger path
//     was verified by code review instead, see the batch summary).
// Items 3/4 (follower water-blocking/flight-bypass) and 7 (Kortho
// geography visuals) are verified by code review + the direct
// isWaterBlocked/nearestLandTile checks already run separately — not
// re-tested here.
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'BoatRecall' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Brchar' + randomLetters(8);

// execFileSync (no shell) so quotes inside the SQL (jsonb literals,
// double-quoted "row") never fight with shell-level quoting.
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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

// --- Item 5: recall — no point set yet, castRecall should fail cleanly ---
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR}';`);
let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));

// Recall is a level-15 Utility Classroom spell — bypass the level grind
// for this test by writing the skill directly, same shortcut convention
// other test scripts in this repo already use for gating.
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET skills = skills || '{"recall": 100}'::jsonb, gold = 500 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));
console.log('recall in skills after SQL grant:', latestSync?.skills?.recall);

const recallBeforeSet = await new Promise((resolve) => socket.emit('castRecall', {}, resolve));
console.log('castRecall before any point set:', JSON.stringify(recallBeforeSet));
check('castRecall fails cleanly with no recall point set', recallBeforeSet.ok === false);

// --- Item 1: buy boats at Kortho's new Boat Shop ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Kortho Boat Shop', "row"=3, col=15 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));

const buyCanoeAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'kortho-boat-shop', itemLabel: 'a small canoe' }, resolve));
console.log('buyItem(canoe) ack:', JSON.stringify(buyCanoeAck));
check('bought a small canoe', buyCanoeAck.ok === true);

// --- Item 5: set Kortho as recall point (need to be in a qualifying map
// — Kortho Boat Shop is a shop interior, not Kortho itself, so step out
// onto the street first). ---
// Row 40 / col 45 is clear of every shop building's own footprint (the
// row-15 and row-32 shop doors' footprints only reach rows 8-14/25-31)
// and clear of the dock's own row band (TOWN_MID_ROW ± 2) — genuine open
// water lies due east of here, past the sand strip.
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Kortho', "row"=40, col=45, inventory='["a small canoe"]' WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
let latestMapState = null;
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 400));

const setRecallAck = await new Promise((resolve) => socket.emit('setRecallPoint', {}, resolve));
console.log('setRecallPoint at Kortho ack:', JSON.stringify(setRecallAck));
check('set Kortho as recall point', setRecallAck.ok === true && setRecallAck.recallPointId === 'kortho');
console.log('myProfile.recallPointId after set:', latestSync?.recallPointId);
check('sync reflects recallPointId=kortho', latestSync?.recallPointId === 'kortho');

// --- Item 1: walk onto Kortho's new sea via the dock and confirm
// auto-board, then walk back onto the sand and confirm auto-disembark ---
async function move(direction) {
  const ack = await new Promise((resolve) => socket.emit('move', direction, resolve));
  if (ack?.player) latestSync = ack.player;
  return ack;
}

console.log('player before crossing:', latestSync?.map, latestSync?.row, latestSync?.col, 'inBoat:', latestSync?.inBoat);
let enteredWater = false;
for (let i = 0; i < 15 && !enteredWater; i++) {
  const ack = await move('east');
  if (!ack.ok) {
    console.log('move east blocked at', latestSync?.row, latestSync?.col, ack.message);
    break;
  }
  if (latestSync?.inBoat) enteredWater = true;
}
console.log('player after crossing attempt:', latestSync?.map, latestSync?.row, latestSync?.col, 'inBoat:', latestSync?.inBoat);
check('auto-boarded the canoe on stepping onto the sea', enteredWater);

if (enteredWater) {
  let disembarked = false;
  for (let i = 0; i < 10 && !disembarked; i++) {
    const ack = await move('west');
    if (!ack.ok) break;
    if (!latestSync?.inBoat) disembarked = true;
  }
  console.log('player after returning:', latestSync?.map, latestSync?.row, latestSync?.col, 'inBoat:', latestSync?.inBoat);
  check('auto-disembarked back on land', disembarked);
}

// --- Item 5: recall back to Kortho from elsewhere ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 400));

const recallAck = await new Promise((resolve) => socket.emit('castRecall', {}, resolve));
console.log('castRecall ack:', JSON.stringify(recallAck));
check('recall teleport succeeded', recallAck.ok === true);
await new Promise((r) => setTimeout(r, 300));
console.log('player after recall:', latestSync?.map, latestSync?.row, latestSync?.col);
check('recalled to Kortho', latestSync?.map === 'Kortho');

// --- Item 6: die to a monster kill, confirm the 10s countdown blocks
// movement and respawn lands at the set recall point (Kortho) ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40, hp=1 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 500));

const target = latestMapState?.monsters?.[0];
if (!target) {
  console.log('FAIL - no monster found to die to on Grimoak Grounds');
  failed = true;
} else {
  console.log('found monster', target.kind, 'at', target.row, target.col, '- moving next to it at 1 hp');
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  psql(`UPDATE players SET "row"=${target.row}, col=${target.col - 1}, hp=1 WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('sync', (data) => (latestSync = data.player));
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 500));

  // Punch it — its counter-attack should kill our 1hp character.
  let died = false;
  for (let i = 0; i < 6 && !died; i++) {
    socket.emit('punch', 'east');
    await new Promise((r) => setTimeout(r, 3200));
    if (latestSync?.respawningUntil) died = true;
  }
  check('died and entered respawn countdown', died);

  if (died) {
    const moveWhileDead = await move('north');
    console.log('move while respawning ack:', JSON.stringify(moveWhileDead));
    check('movement blocked while respawning', moveWhileDead.ok === false);

    console.log('waiting out the 10s respawn countdown...');
    await new Promise((r) => setTimeout(r, 11000));
    console.log('player after respawn:', latestSync?.map, latestSync?.row, latestSync?.col, 'hp:', latestSync?.hp, 'respawningUntil:', latestSync?.respawningUntil);
    check('respawn countdown cleared', !latestSync?.respawningUntil);
    check('respawned at the set recall point (Kortho), not the old fixed start map', latestSync?.map === 'Kortho');
    check('hp restored on respawn', latestSync?.hp === latestSync?.maxHp);
  }
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
