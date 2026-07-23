// A later follow-up ask: "show the damage that a player takes on screen
// when they get hit, right above the player like a fading number. Also
// show the damage an enemy/monster takes on screen also like a fading
// number like '13 slash damage'/'20 fire damage'/'20 water damage'."
//
// Two separate delivery paths were wired up:
// - The broadcast 'combat' event (server/game-gateway/game.gateway.ts's
//   emitCombat) already carries `damage`/`skill`/`targetKind`/`target` --
//   client/game/WorldScene.ts's applyCombatEvent now spawns a floating
//   number above whichever sprite (monster/npc/other player/the local
//   player) the event actually targeted.
// - A monster's own counter-attack/proactive hit (resolveMonsterCounterAttack)
//   is resolved PRIVATELY (not through the broadcast 'combat' event, since
//   the "attacker" there is a monster, not a real player username) -- this
//   now also emits a new, dedicated 'selfDamage' event carrying just the
//   raw damage number.
//
// This test teleports right next to a live monster (close, then
// reconnects so the server's own in-memory position actually reflects
// it -- handleConnection re-reads from the DB) and confirms both a
// 'combat' event (with a real numeric `damage` and no `skill`, i.e. a
// plain melee hit) AND a 'selfDamage' event (the monster's own counter
// landing back) arrive over the wire.
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
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
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

const CHAR = 'Dm' + randomLetters(8);
const UNAME = ('Dm' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20, hp=200, max_hp=200 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket1 = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket1.on('map:state', (state) => {
    if (state.monsters?.length > 0) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});
if (!mapState) throw new Error('no monster found nearby');
// Pick the CLOSEST monster to the starting position, not just the first
// one reported -- Grimoak Grounds is huge, and monsters can be reported
// from anywhere on the whole map.
let monster = mapState.monsters[0];
let bestDist = Math.abs(monster.row - 80) + Math.abs(monster.col - 20);
for (const m of mapState.monsters) {
  const d = Math.abs(m.row - 80) + Math.abs(m.col - 20);
  if (d < bestDist) {
    bestDist = d;
    monster = m;
  }
}
console.log('closest monster:', monster.kind, monster.id, 'at', monster.row, monster.col, `(distance ${bestDist})`);
socket1.close();
await new Promise((r) => setTimeout(r, 300));

psql(`UPDATE players SET "row"=${monster.row}, col=${monster.col - 1} WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);

let combatEvent = null;
let selfDamageEvent = null;
socket2.on('combat', (event) => {
  if (event.targetKind === 'monster' && event.target === monster.id && !combatEvent) combatEvent = event;
});
socket2.on('selfDamage', (data) => {
  if (!selfDamageEvent) selfDamageEvent = data;
});

// handlePunch (unlike move/moveDiagonal) returns void -- no ack callback
// ever fires. It also just ARMS a combat session -- the real hit only
// resolves on the next slow combat tick (MONSTER_TICK_INTERVAL_MS, 3s),
// not immediately.
socket2.emit('punch', 'east');
for (let i = 0; i < 6 && (!combatEvent || !selfDamageEvent); i++) {
  await new Promise((r) => setTimeout(r, 3200));
}

console.log('combat event (my hit on the monster):', JSON.stringify(combatEvent));
check('a "combat" event fired for my own melee hit on the monster', combatEvent !== null);
check('the combat event carries a real positive damage number', combatEvent && combatEvent.damage > 0, combatEvent ? `damage=${combatEvent.damage}` : 'no event');
check('a plain melee hit carries no `skill` (nothing to project/label as a named spell)', combatEvent && combatEvent.skill === undefined, combatEvent ? `skill=${combatEvent.skill}` : 'no event');

console.log("selfDamage event (the monster's counter-attack on me):", JSON.stringify(selfDamageEvent));
check("a \"selfDamage\" event fired for the monster's own counter-attack on me", selfDamageEvent !== null, 'may need more attack attempts if the monster kept missing/being avoided');
if (selfDamageEvent) check('the selfDamage event carries a real positive damage number', selfDamageEvent.damage > 0, `damage=${selfDamageEvent.damage}`);

socket2.close();
psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);

process.exit(failures > 0 ? 1 : 0);
