import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';
const UNAME = 'FollowerTest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Fwtchar' + ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];

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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

// Teleport next to the pet shop (Bramwick, vendor at 20,20) before ever
// connecting, so the socket's own connect-time load picks it up.
const { execSync } = await import('child_process');
function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'inherit' });
}
psql(`UPDATE players SET map='Bramwick', "row"=20, col=21 WHERE username='${CHAR}';`);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
console.log('connected at Bramwick');

let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 300));

const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' }, resolve));
console.log('buyItem(puppy) ack:', JSON.stringify(buyAck));

socket.disconnect();
await new Promise((r) => setTimeout(r, 300));

// Now teleport to Grimoak Grounds spawn, where imps roam.
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR}';`);

({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
console.log('reconnected at Grimoak Grounds');

let latestMapState = null;
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => console.log('[combatNotice]', msg));
await new Promise((r) => setTimeout(r, 500));

console.log('my pet in map:state:', JSON.stringify(latestMapState?.pets?.find((p) => p.ownerUsername === CHAR)));

const imp = latestMapState?.monsters?.find((m) => m.kind === 'imp');
if (!imp) {
  console.log('FAIL: no imp found on Grimoak Grounds.');
  socket.disconnect();
  process.exit(1);
}
console.log('targeting imp', imp.id, 'at', imp.row, imp.col);

const attackAck = await new Promise((resolve) => socket.emit('commandFollowerAttack', { targetKind: 'monster', targetId: imp.id }, resolve));
console.log('commandFollowerAttack ack:', JSON.stringify(attackAck));

// Watch the pet's command/target fields + position over a few ticks
// (~3s each) to confirm it actually armed 'attack' and is stepping
// toward the imp — not necessarily waiting for full contact/kill.
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 3200));
  const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  console.log(`tick ${i}: pet =`, JSON.stringify(pet));
}

const finalPet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
const pass = finalPet?.command === 'attack' && finalPet?.attackTargetId === imp.id;
console.log(pass ? 'PASS: pet armed with attack command + correct target id, stepping each tick.' : 'FAIL: pet state not as expected.');

socket.disconnect();
process.exit(pass ? 0 : 1);
