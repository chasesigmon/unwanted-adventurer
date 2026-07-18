// Phase B — run AFTER an actual server process restart (which wipes
// PetManagerService's in-memory map entirely). Reconnects as phase A's
// same character and confirms its pet reappeared (from the persisted DB
// `pet` column, via PetManagerService.restore, called from
// handleConnection) with the SAME level/exp phase A left it at, rather
// than being gone or reset to a freshly-bought level 1.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = process.argv[2];
const CHAR = process.argv[3];
const PASSWORD = 'testpass123';

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
  return execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d -t -A`, { input: sql, encoding: 'utf-8' });
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const petBeforeReconnect = JSON.parse(psql(`SELECT pet FROM players WHERE username='${CHAR}';`).trim());
  console.log('persisted pet before reconnect:', JSON.stringify(petBeforeReconnect).slice(0, 250));

  const { token: accountToken } = await post('/auth/login', { username: UNAME, password: PASSWORD });
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestState = null;
  socket.on('map:state', (state) => {
    latestState = state;
  });
  await new Promise((r) => setTimeout(r, 900));

  // Nudge a move so the fresh map:state broadcast actually includes us.
  await emit(socket, 'move', 'north');
  await new Promise((r) => setTimeout(r, 300));
  await emit(socket, 'move', 'south');
  await new Promise((r) => setTimeout(r, 300));

  const restoredPet = latestState?.pets?.find((p) => p.ownerUsername.toLowerCase() === CHAR.toLowerCase());
  console.log('pet in map:state after reconnect (post-restart):', JSON.stringify(restoredPet).slice(0, 300));

  check('the pet reappeared after a real server restart', !!restoredPet);
  check('its exp survived the restart (not reset to a fresh 0)', restoredPet?.exp === petBeforeReconnect.exp);
  check('its level survived the restart', restoredPet?.level === petBeforeReconnect.level);
  check('its kind/name survived the restart', restoredPet?.kind === petBeforeReconnect.kind && restoredPet?.name === petBeforeReconnect.name);

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, {
      input: `DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`,
      encoding: 'utf-8',
    });
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nPHASE B ALL PASS' : '\nPHASE B SOME FAILED');
process.exitCode = allPass ? 0 : 1;
