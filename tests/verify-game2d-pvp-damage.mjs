import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function randomLetters(n) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}
const PASSWORD = 'testpass123';
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; } else { console.log(`OK: ${msg}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerOnly(race, username) {
  const res = await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD, race }) });
  const body = await res.json();
  if (!body.token) throw new Error(`register failed: ${JSON.stringify(body)}`);
  return body.token;
}
function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}
function waitForCombat(socket, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('combat timeout')), timeoutMs);
    socket.once('combat', (p) => { clearTimeout(timer); resolve(p); });
  });
}
function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  const usernameA = `GtwoPvpTwoA${randomLetters(4)}`;
  const usernameB = `GtwoPvpTwoB${randomLetters(4)}`;
  const tokenA = await registerOnly('goblin', usernameA);
  const tokenB = await registerOnly('skeleton', usernameB);

  const { socket: closeA } = await connectSocket(tokenA);
  closeA.close();
  const { socket: closeB } = await connectSocket(tokenB);
  closeB.close();
  await sleep(300);

  teleport(usernameA, 'Great Plains', 3, 3);
  teleport(usernameB, 'Great Plains', 3, 4);

  const { socket: socketA } = await connectSocket(tokenA);
  const { socket: socketB, sync: syncB } = await connectSocket(tokenB);
  assert(syncB.player.row === 3 && syncB.player.col === 4, 'player B teleported to (3,4)');

  const combatPromiseB = waitForCombat(socketB);
  socketA.emit('punch', 'east');
  const combatSeenByB = await combatPromiseB;
  console.log('PvP combat seen by B ->', combatSeenByB);
  assert(combatSeenByB.attacker === usernameA && combatSeenByB.targetKind === 'player' && combatSeenByB.target === usernameB, 'player A punching east hits player B');
  assert(combatSeenByB.damage === 6, 'PvP damage matches the same base formula (6 for level-1/str-1 vs level-1/str-1)');
  assert(combatSeenByB.targetHp === 94, "player B's hp drops to 94/100");

  socketA.close();
  socketB.close();
  console.log('\nDone.');
}

main().catch((err) => { console.error('ERROR', err); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
