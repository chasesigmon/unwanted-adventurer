// Verifies this batch's 3 socket-testable fixes: (1) a pet gains exp from
// an owner's kill even when NOT explicitly commanded to attack that
// monster, and the map:state broadcast reflects it immediately; (4) a pet
// is rejected from equipFollowerItem (holding-only); (5) Gobbler Village's
// exit/hut mechanics work end-to-end. Items 2/3 (sign position, road
// patches, tree visibility) are pure client-rendering fixes verified by
// code review + a live screenshot, not socket-testable.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'BatchFinal' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) =>
  Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Bfchar' + randomLetters(8);

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'inherit' });
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

// --- Buy a pet at the Bramwick pet shop ---
psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=3, col=5 WHERE username='${CHAR}';`);
let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 300));
const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' }, resolve));
console.log('buyItem(puppy) ack:', JSON.stringify(buyAck));
check('pet purchase succeeded', buyAck.ok === true);
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));

// --- Item 1: pet exp gain from a kill WITHOUT commanding it to attack ---
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
let latestMapState = null;
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 600));

let myPet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet before kill: exp=' + myPet?.exp + ' level=' + myPet?.level + ' command=' + myPet?.command);
check('pet command is NOT attack (default follow/stay)', myPet && myPet.command !== 'attack');

// Prefer a weak 'imp' (30 hp, low counter-damage) over the 130hp/level-7
// wild goblin the user mentioned in their report — grantPetExpForKill's
// fix is generic over ANY kill on the same map (see game.gateway.ts),
// so an imp kill exercises the exact same code path much faster/safer
// than grinding down a much tankier monster in this test.
const target = latestMapState?.monsters?.find((m) => m.kind === 'imp') ?? latestMapState?.monsters?.[0];
if (!target) {
  console.log('FAIL - no monster found on Grimoak Grounds to test with');
  failed = true;
} else {
  console.log('found monster', target.kind, 'lvl', target.level, 'id', target.id, 'at', target.row, target.col);
  // Teleport the player directly next to the monster and punch it
  // repeatedly (the player's own attack, NOT commandFollowerAttack) —
  // this is the exact "didn't explicitly command the pet" play pattern
  // the user described. Disconnect BEFORE the SQL reposition (never the
  // reverse) — handleDisconnect's own async persistPosition would
  // otherwise clobber the teleport with the stale pre-teleport position.
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  psql(`UPDATE players SET "row"=${target.row}, col=${target.col - 1} WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('map:state', (data) => (latestMapState = data));
  socket.on('combatNotice', (msg) => console.log('[combatNotice]', msg));
  let latestSelfSync = null;
  socket.on('sync', (data) => (latestSelfSync = data.player));
  await new Promise((r) => setTimeout(r, 500));

  // Chase-and-punch loop: the imp patrols (see monster.ts's
  // patrolRangeTiles), so rather than assume it's still adjacent to
  // where it was BEFORE the teleport/reconnect round-trip, recompute its
  // live position from map:state every iteration and either step toward
  // it or punch it if already cardinally adjacent. Combat itself still
  // resolves on the ~3s server tick (ATTACK_COOLDOWN_MS).
  let killed = false;
  for (let i = 0; i < 15 && !killed; i++) {
    const monster = latestMapState?.monsters?.find((m) => m.id === target.id);
    if (!monster) {
      killed = true;
      break;
    }
    const me = latestSelfSync ?? latestMapState?.players?.find((p) => p.username === CHAR);
    const dRow = monster.row - me.row;
    const dCol = monster.col - me.col;
    let direction;
    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      direction = dRow === -1 ? 'north' : dRow === 1 ? 'south' : dCol === -1 ? 'west' : 'east';
      socket.emit('punch', direction);
      console.log('tick', i, 'adjacent, punching', direction, 'monster hp:', monster.hp);
    } else {
      direction = Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
      const ack = await new Promise((resolve) => socket.emit('move', direction, resolve));
      if (ack?.player) latestSelfSync = ack.player;
      console.log('tick', i, 'not adjacent (dRow=' + dRow + ' dCol=' + dCol + '), moving', direction);
    }
    await new Promise((r) => setTimeout(r, 3200));
    const stillAlive = latestMapState?.monsters?.some((m) => m.id === target.id);
    if (!stillAlive) killed = true;
  }
  check('monster was killed', killed);

  await new Promise((r) => setTimeout(r, 500));
  const petAfter = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  console.log('pet after kill: exp=' + petAfter?.exp + ' level=' + petAfter?.level);
  check(
    'pet exp increased after owner kill (no attack command needed)',
    petAfter && myPet && (petAfter.exp > myPet.exp || petAfter.level > myPet.level)
  );
}

// --- Item 4: pets cannot equip gear ---
const equipAck = await new Promise((resolve) => socket.emit('equipFollowerItem', { followerKind: 'pet', itemIndex: 0 }, resolve));
console.log('equipFollowerItem(pet) ack:', JSON.stringify(equipAck));
check('pet equip rejected', equipAck.ok === false);

socket.disconnect();
await new Promise((r) => setTimeout(r, 300));

// --- Item 5: Gobbler Village exit + hut entry ---
psql(`UPDATE players SET map='Grimoak Grounds', "row"=75, col=96 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));
console.log('player position before east walk:', latestSync?.map, latestSync?.row, latestSync?.col);

let enteredVillage = false;
for (let i = 0; i < 8 && !enteredVillage; i++) {
  const ack = await new Promise((resolve) => socket.emit('move', 'east', resolve));
  console.log('move east ack:', JSON.stringify(ack));
  if (ack?.player) latestSync = ack.player;
  await new Promise((r) => setTimeout(r, 250));
  if (latestSync?.map === 'Gobbler Village') enteredVillage = true;
}
console.log('player position after walking east:', latestSync?.map, latestSync?.row, latestSync?.col);
check('walked from Grimoak Grounds into Gobbler Village', enteredVillage);

if (enteredVillage) {
  // Walk toward Gobbler Hut 1's door (row 10, col 14) and confirm we can
  // enter it. Disconnect BEFORE the SQL reposition (see the earlier
  // comment on this same gotcha).
  socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  psql(`UPDATE players SET "row"=11, col=14 WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('sync', (data) => (latestSync = data.player));
  await new Promise((r) => setTimeout(r, 400));

  let enteredHut = false;
  for (let i = 0; i < 4 && !enteredHut; i++) {
    const ack = await new Promise((resolve) => socket.emit('move', 'north', resolve));
    console.log('move north ack:', JSON.stringify(ack));
    if (ack?.player) latestSync = ack.player;
    await new Promise((r) => setTimeout(r, 250));
    if (latestSync?.map === 'Gobbler Hut 1') enteredHut = true;
  }
  console.log('player position after walking north into door:', latestSync?.map, latestSync?.row, latestSync?.col);
  check('walked through Gobbler Hut 1 door', enteredHut);
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
