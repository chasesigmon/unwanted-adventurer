import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'AnimImpTest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Aitest' + rand2() + rand2();

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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Grant animate dead + a high level so animatedMonsterCapFor allows one,
// and boost strength/level so we one/two-shot an imp quickly with punch.
psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40, level=20, skills='{"animate dead": 100, "punch": 100}', strength=30 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let latestMapState = null;
let latestSync = null;
const notices = [];
socket.on('map:state', (data) => (latestMapState = data));
socket.on('sync', (data) => (latestSync = data.player));
socket.on('combatNotice', (msg) => { notices.push(msg); console.log('[combatNotice]', msg); });
socket.on('combat', (data) => console.log('[combat]', JSON.stringify(data.message || data)));
await new Promise((r) => setTimeout(r, 800));

const imps = latestMapState?.monsters?.filter((m) => m.kind === 'imp') ?? [];
console.log(`found ${imps.length} imps`);
const targetImp = imps[0];
if (!targetImp) { console.log('FAIL: no imp'); process.exit(1); }

// Walk to be adjacent to the imp, then punch it repeatedly until it dies.
console.log('imp at', targetImp.row, targetImp.col, 'player at', latestSync?.row ?? 63, latestSync?.col ?? 40);

// Move toward the imp step by step (simple greedy), then punch each tick.
async function tryMove(dir) {
  const ack = await new Promise((resolve) => socket.emit('move', dir, resolve));
  if (ack?.player) latestSync = ack.player;
  await new Promise((r) => setTimeout(r, 230));
  return ack?.ok === true;
}

async function moveToward(targetRow, targetCol, maxSteps = 80) {
  for (let i = 0; i < maxSteps; i++) {
    const row = latestSync?.row ?? 63;
    const col = latestSync?.col ?? 40;
    const dRow = targetRow - row;
    const dCol = targetCol - col;
    if (Math.abs(dRow) + Math.abs(dCol) <= 1) return true;
    const candidates = [];
    if (dRow !== 0) candidates.push(dRow > 0 ? 'south' : 'north');
    if (dCol !== 0) candidates.push(dCol > 0 ? 'east' : 'west');
    let moved = false;
    for (const dir of candidates) {
      if (await tryMove(dir)) {
        moved = true;
        break;
      }
    }
    if (!moved) {
      // Both preferred directions blocked — try any direction to get
      // unstuck rather than looping forever on the same wall.
      for (const dir of ['north', 'south', 'east', 'west']) {
        if (await tryMove(dir)) {
          moved = true;
          break;
        }
      }
    }
    if (!moved) return false;
  }
  return false;
}

const reached = await moveToward(targetImp.row, targetImp.col);
console.log('reached adjacency:', reached, 'now at', latestSync?.row, latestSync?.col);

// Face and punch toward the imp repeatedly across several combat ticks
// until it dies (30hp, punch should hit decently hard at str 30).
let impDead = false;
for (let i = 0; i < 12 && !impDead; i++) {
  const row = latestSync?.row ?? 63;
  const col = latestSync?.col ?? 40;
  const dRow = targetImp.row - row;
  const dCol = targetImp.col - col;
  const dir = Math.abs(dRow) >= Math.abs(dCol) ? (dRow > 0 ? 'south' : 'north') : (dCol > 0 ? 'east' : 'west');
  socket.emit('punch', dir);
  await new Promise((r) => setTimeout(r, 3100));
  impDead = !latestMapState?.monsters?.some((m) => m.id === targetImp.id);
  console.log(`punch tick ${i}: imp still alive = ${!impDead}`);
}

if (!impDead) {
  console.log('FAIL: could not kill the imp in time');
  socket.disconnect();
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 500));
const corpse = latestMapState?.corpses?.find((c) => c.kind === 'imp');
console.log('corpse:', JSON.stringify(corpse));
if (!corpse) { console.log('FAIL: no corpse found'); process.exit(1); }

const animateAck = await new Promise((resolve) => socket.emit('castAnimateDead', { corpseId: corpse.id }, resolve));
console.log('castAnimateDead ack:', JSON.stringify(animateAck));

await new Promise((r) => setTimeout(r, 500));
const animMonster = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR);
console.log('animated monster:', JSON.stringify(animMonster));

const otherImp = latestMapState?.monsters?.find((m) => m.kind === 'imp' && m.id !== targetImp.id);
if (!otherImp) { console.log('FAIL: no second imp to attack'); process.exit(1); }
console.log('commanding animated imp to attack', otherImp.id, 'at', otherImp.row, otherImp.col);

const cmdAck = await new Promise((resolve) => socket.emit('commandFollowerAttack', { targetKind: 'monster', targetId: otherImp.id }, resolve));
console.log('commandFollowerAttack ack:', JSON.stringify(cmdAck));

let dealtDamage = false;
for (let i = 0; i < 20 && !dealtDamage; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const am = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR);
  console.log(`tick ${i}: animated imp at (${am?.row},${am?.col}) command=${am?.command} target=${am?.attackTargetId} alive=${am?.alive}`);
  dealtDamage = notices.some((m) => m.includes('strikes the') || m.includes('finishes off'));
}

console.log(dealtDamage ? 'PASS: animated imp dealt damage' : 'FAIL: animated imp never dealt damage');
socket.disconnect();
process.exit(dealtDamage ? 0 : 1);
