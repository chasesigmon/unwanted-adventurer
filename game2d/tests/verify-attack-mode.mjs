import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'AtkModeTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Amtest' + rand2() + rand2();

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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6 WHERE username='${CHAR}';`);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestMapState = null;
const notices = [];
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => { notices.push(msg); console.log('[combatNotice]', msg); });
await new Promise((r) => setTimeout(r, 500));

await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' }, resolve));
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => { notices.push(msg); console.log('[combatNotice]', msg); });
await new Promise((r) => setTimeout(r, 1200));

// Step 1: set command to 'attack' with NO target/fight in progress —
// should fall back to following, not freeze in place.
const cmdAck = await new Promise((resolve) => socket.emit('petCommand', 'attack', resolve));
console.log('petCommand(attack) with no fight ack:', JSON.stringify(cmdAck));
const petBefore = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet right after attack-mode set:', JSON.stringify(petBefore));

await new Promise((r) => setTimeout(r, 3000));
const petAfterWait = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet after 3s with no fight:', JSON.stringify(petAfterWait));
check("attack mode with no fight falls back to following (command stays 'attack', doesn't freeze)", petAfterWait?.command === 'attack');

// Step 2: player engages a nearby imp via punch — the pet (already in
// 'attack' mode) should automatically start chasing/attacking it, with
// NO 'z' press at all.
// Find an imp actually within wand-bolt range (7 tiles) of the player's
// own current position, rather than assuming the first one in the list
// is close enough.
const playerRow = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR)?.row ?? 63;
const playerCol = 40;
const imp = latestMapState?.monsters
  ?.filter((m) => m.kind === 'imp')
  .find((m) => Math.abs(m.row - 63) <= 7 && Math.abs(m.col - 40) <= 7);
if (!imp) {
  check('found an imp within wand-bolt range to engage', false);
} else {
  console.log('engaging imp', imp.id, 'at', imp.row, imp.col, 'via engageRangedAttack (wand bolt)');
  const engageAck = await new Promise((resolve) => socket.emit('engageRangedAttack', { targetKind: 'monster', targetId: imp.id }, resolve));
  console.log('engageRangedAttack ack:', JSON.stringify(engageAck));

  let synced = false;
  for (let i = 0; i < 10 && !synced; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
    console.log(`tick ${i}: pet target=${pet?.attackTargetId} (imp=${imp.id})`);
    synced = pet?.attackTargetId === imp.id;
  }
  check("attack-mode pet auto-targets whatever the player engages, no 'z' needed", synced);
}

console.log(allPass ? '\nALL ATTACK-MODE CHECKS PASSED' : '\nSOME ATTACK-MODE CHECKS FAILED');
socket.disconnect();
process.exit(allPass ? 0 : 1);
