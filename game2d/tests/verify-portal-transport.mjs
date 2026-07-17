// Live verification for item 7 (prioritized): "I still am not able to go
// through the Portals into the other worlds." Root cause: portalPositionsFor's
// 4 tiles on Grimoak Castle 4th Floor were still marked isPortalBlocked
// for PLAYER movement (WorldManagerService.isOccupied) even after a later
// follow-up ask gave each one a real MapExit in shared/maps.ts — the
// player could never even stand on the exit tile to trigger it. Places a
// character one tile south of the north portal, confirms walking onto
// the portal tile now succeeds (previously rejected), then confirms
// stepping further north from there actually transitions to Sunken Crypt
// (the north portal's real destination).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'PortalTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Portaltest' + rand2() + rand2();

// FLOOR_LANDING_ROWS=17, FLOOR_LANDING_COLS=25 (see shared/maps.ts) ->
// FLOOR4_PORTAL_MID_COL = floor(25/2) = 12. North portal sits at (0, 12).
const PORTAL_ROW = 0;
const PORTAL_COL = 12;

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

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(`UPDATE players SET map='Grimoak Castle 4th Floor', "row"=${PORTAL_ROW + 1}, col=${PORTAL_COL} WHERE username='${CHAR}';`);

  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  const ontoPortal = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  check('walking onto the portal tile now succeeds', ontoPortal.ok === true);
  check('player is standing exactly on the portal tile', ontoPortal.player?.row === PORTAL_ROW && ontoPortal.player?.col === PORTAL_COL);
  check('still on Grimoak Castle 4th Floor (not transported yet)', ontoPortal.player?.map === 'Grimoak Castle 4th Floor');

  const throughPortal = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  check('stepping further north transports to Sunken Crypt', throughPortal.ok === true && throughPortal.player?.map === 'Sunken Crypt');
  console.log('arrived at:', throughPortal.player?.map, throughPortal.player?.row, throughPortal.player?.col);

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
