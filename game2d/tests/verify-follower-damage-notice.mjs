// Items 9 & 20 of a later follow-up ask: "show how much damage the
// monster does to the tamed beast/animated dead/pet/summon in the
// combat/chat window" and "when [it]... is in attack mode... it should
// begin auto attacking that monster." Buys a pet, commands it to attack a
// real wild monster, then has the PLAYER engage the same monster with a
// ranged wand attack (much easier to land reliably than melee-punch
// exact-direction adjacency) so the monster's aggro redirects onto the
// already-attacking pet (the existing "follower draws aggro" mechanic,
// setAggro in monster-manager.service.ts) and starts counter-attacking it
// via the fast chaseAggroTargets tick. Confirms a 'combatNotice' naming
// the pet and a damage amount arrives.
//
// Run with `node tests/verify-follower-damage-notice.mjs` against the
// live dev server -- requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FolDmg' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Fd' + randomLetters(8);

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

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6, gold=100 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const buyRes = await emit(socket, 'buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' });
check('bought a puppy', buyRes?.ok === true, JSON.stringify(buyRes));

socket.close();
psql(`UPDATE players SET map='Grimoak Grounds', "row"=44, col=50, mana=200, max_mana=200, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
let lastMapState = null;
const notices = [];
socket2.on('map:state', (payload) => {
  lastMapState = payload;
});
socket2.on('combatNotice', (msg) => notices.push(msg));
await new Promise((r) => setTimeout(r, 800));

const candidates = (lastMapState?.monsters ?? []).filter((m) => m.kind === 'wolf' || m.kind === 'moose');
check('a nearby monster is visible', candidates.length > 0, `monsters seen: ${lastMapState?.monsters?.map((m) => m.kind).join(', ') || 'none'}`);
if (candidates.length === 0) {
  socket2.close();
  process.exit(1);
}
const dist = (m) => Math.abs(m.row - 44) + Math.abs(m.col - 50);
const monster = candidates.sort((a, b) => dist(a) - dist(b))[0];
console.log(`picked closest monster: ${monster.kind} at (${monster.row},${monster.col}), distance=${dist(monster)}`);

// Teleport the PLAYER (via reconnect, so DB position sticks) to within
// SPELL_ATTACK_RANGE_TILES (7) of the monster -- much easier than exact
// melee-punch adjacency/facing.
socket2.close();
const nearRow = monster.row;
const nearCol = Math.max(0, monster.col - 3);
psql(`UPDATE players SET "row"=${nearRow}, col=${nearCol} WHERE username='${CHAR}';`);
const socket3 = await connect(charToken);
socket3.on('map:state', (payload) => {
  lastMapState = payload;
});
socket3.on('combatNotice', (msg) => notices.push(msg));
await new Promise((r) => setTimeout(r, 800));

await emit(socket3, 'petCommand', 'follow');
const attackRes = await emit(socket3, 'commandFollowerAttack', { targetKind: 'monster', targetId: monster.id });
console.log('commandFollowerAttack ack:', JSON.stringify(attackRes));

// Deliberately NOT also engaging with the player's own wand -- the pet's
// own contact (resolveFollowerContact -> engageCombat -> combatTick's
// melee-branch setAggro) already redirects the wolf's aggro onto the pet
// on its own; adding the player's ranged attack on top just kills the
// wolf (55 hp vs the pet's own 5 dmg/hit) before it gets a chance to
// counter-attack even once.
await new Promise((r) => setTimeout(r, 20000));

console.log('combat notices seen:', JSON.stringify(notices));
const hitNotice = notices.find((n) => /hits your puppy for \d+ damage/.test(n));
check('a "hits your puppy for N damage" combat notice arrived', Boolean(hitNotice), notices.join(' | ') || 'none seen');

const myPet = lastMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet final state:', JSON.stringify(myPet));

socket3.close();
process.exit(failures > 0 ? 1 : 0);
