// Live end-to-end check for the first-person mode's own "must aim your
// wand at the target to hit" rule (a big follow-up ask). Confirms:
//   1. In first-person mode, the wand's ranged auto-attack MISSES when
//      the player is facing away from the target.
//   2. Once aimed correctly (same target, same range), it HITS.
//   3. Outside first-person mode, a misaimed angle has NO effect at all —
//      normal top-down auto-attack still lands exactly as it always has.
// Mirrors tests/verify-elemental-ranged-attack.mjs's own register/select/
// psql-reposition/connect pattern.
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

// Same convention as shared/aiming.ts/mapRender.ts's raycaster: angle 0 =
// facing -row ("north"), increasing clockwise toward +col ("east").
function angleTo(fromRow, fromCol, toRow, toCol) {
  return Math.atan2(toCol - fromCol, -(toRow - fromRow));
}

const CHAR = 'Fp' + randomLetters(8);
const UNAME = ('Fp' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket.on('map:state', (state) => {
    if (state.monsters?.length > 0) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});
if (!mapState) throw new Error('no monsters found to target');
const monster = mapState.monsters[0];
console.log('targeting monster:', monster.kind, monster.id, 'at', monster.row, monster.col);

// 5 tiles away — within WAND_BOLT_RANGE_TILES (7), not melee-adjacent.
const playerRow = monster.row + 5;
const playerCol = monster.col;
socket.close();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET "row"=${playerRow}, col=${playerCol} WHERE username='${CHAR}';`);
socket = await connect(charToken);
// handleConnection is async (awaits a DB read) and only finishes
// initializing client.data — including resetting firstPerson/facingAngle
// to their fresh-connection defaults — after that resolves. Without this
// wait, setFirstPersonMode(true) sent immediately after connecting can
// race ahead of that tail-end reset and get silently stomped back to
// false the moment handleConnection finally finishes. Same 500ms buffer
// tests/verify-elemental-ranged-attack.mjs already uses after its own
// reconnect.
await new Promise((r) => setTimeout(r, 500));

let combatSeen = false;
socket.on('combat', (e) => {
  if (e.targetKind === 'monster' && e.target === monster.id) combatSeen = true;
});

async function tryAttack(seconds) {
  combatSeen = false;
  await emit(socket, 'engageRangedAttack', { targetKind: 'monster', targetId: monster.id });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return combatSeen;
}

const correctAngle = angleTo(playerRow, playerCol, monster.row, monster.col);
const wrongAngle = correctAngle + Math.PI; // facing exactly away from the monster

// setFirstPersonMode/setAimAngle are fire-and-forget (no ack) — a plain
// emit, not the ack-awaiting `emit()` helper above (which would hang
// forever waiting for a callback the server never calls).
async function setFirstPerson(active) {
  socket.emit('setFirstPersonMode', { active });
  await new Promise((r) => setTimeout(r, 50));
}
async function setAim(angle) {
  socket.emit('setAimAngle', { angle });
  await new Promise((r) => setTimeout(r, 50));
}

// --- 1. First-person + misaimed -> miss ---
await setFirstPerson(true);
await setAim(wrongAngle);
const hitWhileMisaimed = await tryAttack(2.5);
check('wand auto-attack MISSES in first-person while facing away from the target', !hitWhileMisaimed);

// --- 2. First-person + correctly aimed -> hit ---
await setAim(correctAngle);
const hitWhileAimed = await tryAttack(2.5);
check('wand auto-attack HITS in first-person once actually aimed at the target', hitWhileAimed);

// --- 3. Exit first-person; misaimed angle should no longer matter at all ---
await setFirstPerson(false);
await setAim(wrongAngle); // ignored server-side once firstPerson is false
const hitOutsideFirstPerson = await tryAttack(2.5);
check('wand auto-attack HITS normally outside first-person regardless of any stale aim angle', hitOutsideFirstPerson);

socket.close();
await new Promise((r) => setTimeout(r, 300));

// Clean up the test account (created by this script, per project convention).
try {
  psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
} catch {
  /* best-effort cleanup */
}

process.exit(failures > 0 ? 1 : 0);
