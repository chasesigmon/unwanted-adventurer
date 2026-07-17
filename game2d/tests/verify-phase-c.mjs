import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'PhaseCTest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Phctest' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)] + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];

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
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

// Give the test character a bone dagger (weapon-slot item) up front, and
// place them right at the pet shop's own vendor tile (see
// server/worlds/vendors.ts: 'Bramwick Pet Shop', row 2, col 5).
psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6, inventory='["bone dagger"]' WHERE username='${CHAR}';`);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
console.log('connected inside Bramwick Pet Shop');

let latestSync = null;
let latestMapState = null;
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
const notices = [];
socket.on('combatNotice', (msg) => notices.push(msg));
await new Promise((r) => setTimeout(r, 500));

// C1 — pet shop cottage: buy a pet from inside its own interior map.
const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' }, resolve));
console.log('buyItem(puppy) ack:', JSON.stringify(buyAck));
await new Promise((r) => setTimeout(r, 400));
const petAfterBuy = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
check('C1: pet spawns inside Bramwick Pet Shop (not the open street)', petAfterBuy?.map === 'Bramwick Pet Shop');

// C2 — speed-matching: teleport to Grimoak Grounds (open space, no
// walls) and watch the pet close distance over real time.
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Grimoak Grounds', "row"=40, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => notices.push(msg));
await new Promise((r) => setTimeout(r, 1200)); // let the pet's own map-follow snap catch up
const petStart = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet position after reconnect:', petStart?.row, petStart?.col);

// Move the player 5 tiles west quickly (well within the pet's own
// FOLLOWER_STEP_MS=300ms cadence) and confirm the pet keeps pace instead
// of falling miles behind.
for (let i = 0; i < 5; i++) {
  await new Promise((resolve) => socket.emit('move', 'west', resolve));
  await new Promise((r) => setTimeout(r, 230));
}
await new Promise((r) => setTimeout(r, 500));
const petAfterMoves = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
const playerCol = latestSync?.col;
console.log('player col:', playerCol, 'pet col:', petAfterMoves?.col);
check(
  'C2: pet keeps pace with the player (within 2 tiles) after 5 quick moves',
  playerCol !== undefined && petAfterMoves && Math.abs(petAfterMoves.col - playerCol) <= 2
);

// C3 — sleep/wake: command sleep, confirm it sticks, then move and
// confirm it auto-wakes back to 'follow'.
const sleepAck = await new Promise((resolve) => socket.emit('petCommand', 'sleep', resolve));
console.log('petCommand(sleep) ack:', JSON.stringify(sleepAck));
await new Promise((r) => setTimeout(r, 300));
const petAsleep = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
check('C3: pet command is "sleep" right after being commanded', petAsleep?.command === 'sleep');

await new Promise((resolve) => socket.emit('move', 'east', resolve));
await new Promise((r) => setTimeout(r, 400));
const petAfterWake = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
check('C3: moving auto-wakes the pet back to "follow"', petAfterWake?.command === 'follow');

// C7 — give + equip a weapon, confirm the pet's own attack damage in the
// next combatNotice reflects the bonus. Find a nearby imp to target.
await new Promise((r) => setTimeout(r, 800));
const imp = latestMapState?.monsters?.find((m) => m.kind === 'imp');
if (!imp) {
  check('C7: found an imp to test weapon-bonus damage against', false);
} else {
  const giveAck = await new Promise((resolve) => socket.emit('giveFollowerItem', { followerKind: 'pet', itemIndex: 0 }, resolve));
  console.log('giveFollowerItem(bone dagger) ack:', JSON.stringify(giveAck));
  const equipAck = await new Promise((resolve) => socket.emit('equipFollowerItem', { followerKind: 'pet', itemIndex: 0 }, resolve));
  console.log('equipFollowerItem ack:', JSON.stringify(equipAck));
  await new Promise((r) => setTimeout(r, 300));
  const petEquipped = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  check('C7: pet now shows bone dagger in its weapon slot', petEquipped?.equipment?.weapon === 'bone dagger');

  const attackAck = await new Promise((resolve) => socket.emit('commandFollowerAttack', { targetKind: 'monster', targetId: imp.id }, resolve));
  console.log('commandFollowerAttack ack:', JSON.stringify(attackAck));

  let sawBonusDamage = false;
  for (let i = 0; i < 20 && !sawBonusDamage; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
    console.log(`  tick ${i}: pet at (${pet?.row},${pet?.col}), command=${pet?.command}, notices so far: ${notices.length}`);
    sawBonusDamage = notices.some((m) => m.includes('for 9 damage'));
  }
  console.log('combat notices seen:', JSON.stringify(notices));
  check('C7: pet deals PET_ATTACK_DAMAGE(5) + FOLLOWER_WEAPON_DAMAGE_BONUS(4) = 9 with a weapon equipped', sawBonusDamage);
}

console.log(allPass ? '\nALL PHASE C CHECKS PASSED' : '\nSOME PHASE C CHECKS FAILED');
socket.disconnect();
process.exit(allPass ? 0 : 1);
