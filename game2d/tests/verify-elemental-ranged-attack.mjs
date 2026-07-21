// Item 30 (live end-to-end companion to verify-flying-pet-evolution.mjs's
// config unit test): places an elemental pet 4 tiles from a real monster
// (NOT melee-adjacent) in 'attack' mode and confirms it actually lands a
// hit from that range within one follower tick -- proving
// PetManagerService.checkContacts' new PET_ATTACK_RANGE_TILES branch
// (isWithinRadius instead of strict adjacency) really fires for the
// elemental specifically.
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

const CHAR = 'Rg' + randomLetters(8);
const UNAME = ('Rg' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket.on('map:state', (state) => {
    if (state.monsters?.length > 0) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});
if (!mapState) throw new Error('no monsters found to target');
const monster = mapState.monsters[0];
console.log('targeting monster:', monster.kind, monster.id, 'at', monster.row, monster.col);

// A tamed-beast-style restore() snaps a persisted pet onto the OWNER's
// CURRENT position on reconnect (see PetManagerService.restore) -- so the
// PLAYER (not the pet's own row/col in this JSON) needs repositioning to
// exactly 4 tiles from the monster (its own range), NOT melee-adjacent.
// Under the OLD strict-adjacency-only checkContacts this would never
// land a hit at all.
const elementalPet = JSON.stringify({
  id: 'ranged-test-elemental',
  ownerUsername: CHAR,
  kind: 'elemental',
  name: 'Lesser Elemental',
  level: 1,
  exp: 0,
  hp: 90,
  maxHp: 90,
  alive: true,
  command: 'attack',
  attackTargetKind: 'monster',
  attackTargetId: monster.id,
  inventory: [],
  equipment: {},
}).replace(/'/g, "''");
// Close FIRST, then write the DB, then reconnect -- the proven-reliable
// order (an already-open old socket's own disconnect-time autosave can
// otherwise clobber an out-of-band DB write made while it's still alive).
socket.close();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET "row"=${monster.row + 4}, col=${monster.col}, pet='${elementalPet}' WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);

let combatNoticeSeen = null;
socket2.on('combatNotice', (msg) => {
  console.log('combatNotice:', msg);
  if (/elemental/i.test(msg)) combatNoticeSeen = msg;
});

await new Promise((r) => setTimeout(r, 500));
const petState = await new Promise((resolve) => {
  socket2.once('map:state', resolve);
  socket2.emit('move', 'north');
});
console.log('pet state after reconnect:', JSON.stringify(petState.pets?.find((p) => p.id === 'ranged-test-elemental')));
console.log('monster state after reconnect:', JSON.stringify(petState.monsters?.find((m) => m.id === monster.id)));

// Wait several follower ticks (~220ms each) plus the pet's own attack
// cooldown window for a hit to land.
await new Promise((r) => setTimeout(r, 2500));
console.log('combat notice seen:', combatNoticeSeen);
check('the elemental landed a hit on the monster from 4 tiles away (ranged attack works)', combatNoticeSeen !== null, 'no combatNotice mentioning the elemental was seen');

socket2.close();
process.exit(failures > 0 ? 1 : 0);
