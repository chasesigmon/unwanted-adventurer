// Item 21: "Player should auto-attack whatever their tamed beast/animated
// dead/pet/summon is auto-attacking." resolveFollowerContact already
// started the player's own attack once the follower actually LANDED a
// hit, but that requires the follower to first walk over to a (possibly
// distant) target -- a real lag. The new engagePlayersOntoFollowerTargets
// (game.gateway.ts, called every FOLLOWER_STEP_MS/~220ms tick) checks the
// follower's own live target directly instead, engaging immediately.
// Confirms this by placing the tamed beast FAR from its target (several
// tiles away, well before it could possibly have walked over and made
// contact) and checking the player receives 'followerEngaged' almost
// immediately anyway.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FollowChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Fw' + randomLetters(8);

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
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket.on('map:state', (state) => {
    if (state.monsters?.length > 0) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});
if (!mapState) throw new Error('no monsters found on Grimoak Grounds to target');
const monster = mapState.monsters[0];
console.log('targeting monster:', monster.kind, monster.id, 'at', monster.row, monster.col);

// Insert a tamed dire wolf FAR from the monster (well outside adjacency)
// so any engagement can only come from the new immediate check, not a
// contact-based one.
const tamedBeast = JSON.stringify({
  id: 'test-wolf-1',
  ownerUsername: CHAR,
  kind: 'dire wolf',
  name: 'Test Wolf',
  level: 10,
  hp: 80,
  maxHp: 80,
  attackDamage: 10,
  map: 'Grimoak Grounds',
  row: monster.row + 15,
  col: monster.col + 15,
  command: 'follow',
}).replace(/'/g, "''");
psql(`UPDATE players SET tamed_beast='${tamedBeast}' WHERE username='${CHAR}';`);
// Reconnect so the manager re-loads the freshly persisted tamed beast.
socket.close();
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

let followerEngagedPayload = null;
socket2.on('followerEngaged', (payload) => {
  followerEngagedPayload = payload;
});

const commandAck = await emit(socket2, 'commandFollowerAttack', { targetKind: 'monster', targetId: monster.id });
console.log('commandFollowerAttack ack:', JSON.stringify(commandAck));
check('commandFollowerAttack succeeded', commandAck.ok === true, JSON.stringify(commandAck));

// Well under the many seconds it'd take the wolf to walk ~21 tiles over
// to make actual contact -- if this fires, it's from the new immediate
// per-tick check, not the old contact-only path.
await new Promise((r) => setTimeout(r, 600));
console.log('followerEngaged received within 600ms:', JSON.stringify(followerEngagedPayload));
check(
  'player received followerEngaged almost immediately, well before the wolf could have walked over to make contact',
  followerEngagedPayload !== null && followerEngagedPayload.targetKind === 'monster' && followerEngagedPayload.targetId === monster.id,
  JSON.stringify(followerEngagedPayload)
);

socket2.close();
process.exit(failures > 0 ? 1 : 0);
