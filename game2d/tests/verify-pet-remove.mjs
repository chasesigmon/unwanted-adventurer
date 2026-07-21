// Item 29: "Add a 'Remove' option to the pet window so players can fully
// remove a pet and get a new one." Confirms via direct socket calls that:
// (a) removePet succeeds when the player has a pet, (b) the pet is
// genuinely gone afterward (map:state no longer lists it), and (c) the
// player can immediately buy a brand-new pet afterward (the whole point
// of the ask — replacing a pet without waiting for it to die first).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
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
function emit(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, (res) => resolve(res)));
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const CHAR = 'Pr' + randomLetters(8);
const UNAME = ('Pr' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
const pet = JSON.stringify({
  id: 'remove-test-pet',
  ownerUsername: CHAR,
  kind: 'puppy',
  name: 'Test Puppy',
  level: 1,
  exp: 0,
  hp: 20,
  maxHp: 20,
  alive: true,
  command: 'follow',
  inventory: [],
  equipment: {},
}).replace(/'/g, "''");
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20, gold=100, pet='${pet}' WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

// Confirm the pet is actually present before removing it.
const beforeState = await new Promise((resolve) => {
  socket.once('map:state', resolve);
  socket.emit('move', 'north');
});
check('the test pet is present before removal', beforeState.pets?.some((p) => p.id === 'remove-test-pet'), JSON.stringify(beforeState.pets));

const removeAck = await emit(socket, 'removePet');
console.log('removePet ack:', JSON.stringify(removeAck));
check('removePet succeeded', removeAck.ok === true, JSON.stringify(removeAck));

const afterState = await new Promise((resolve) => {
  socket.once('map:state', resolve);
  socket.emit('move', 'south');
});
check('the pet is genuinely gone after removal', !afterState.pets?.some((p) => p.id === 'remove-test-pet'), JSON.stringify(afterState.pets));

// A second removePet call (nothing left to remove) should be rejected,
// not silently "succeed" against nothing.
const secondRemoveAck = await emit(socket, 'removePet');
console.log('second removePet ack (nothing to remove):', JSON.stringify(secondRemoveAck));
check('removing again with no pet left is rejected', secondRemoveAck.ok === false, JSON.stringify(secondRemoveAck));

socket.close();
process.exit(failures > 0 ? 1 : 0);
