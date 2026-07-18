// Live verification for item 5: the new Mystical Timberland area — the
// west exit off Grimoak Grounds' own moat-mid-row, full-width band
// transition, and real tree collision inside Mystical Timberland itself.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'Batch6Timber' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Batchsixtimber' + rand2() + rand2();

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
function sql(input) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input, encoding: 'utf-8' });
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
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

  // GRIMOAK_GROUNDS_MOAT_MID_ROW = 45. Stand one tile east of the exit
  // (col 1) and step onto it, then trigger the transition west.
  sql(`UPDATE players SET map='Grimoak Grounds', "row"=45, col=1 WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  let res = await emit(socket, 'move', 'west');
  check('steps onto the new west exit tile (row 45, col 0)', res.ok === true && res.player?.map === 'Grimoak Grounds' && res.player?.col === 0);
  res = await emit(socket, 'move', 'west');
  check('transitions into Mystical Timberland', res.ok === true && res.player?.map === 'Mystical Timberland');
  console.log('arrived at:', res.player?.row, res.player?.col);

  // Find a tree tile near the entrance and confirm it blocks movement.
  const { treePositionsFor } = await import('../shared/trees.js');
  const trees = treePositionsFor('Mystical Timberland');
  const nearEntrance = trees.find((t) => Math.abs(t.row - res.player.row) <= 1 && t.col < res.player.col && t.col > res.player.col - 6);
  if (nearEntrance) {
    console.log('testing collision against tree at', nearEntrance.row, nearEntrance.col);
    socket.close();
    await new Promise((r) => setTimeout(r, 400));
    sql(`UPDATE players SET map='Mystical Timberland', "row"=${nearEntrance.row}, col=${nearEntrance.col + 1} WHERE username='${CHAR}';`);
    const { token: charToken2 } = await post(`/characters/${CHAR}/select`, {}, accountToken);
    const socket2 = await connect(charToken2);
    await new Promise((r) => setTimeout(r, 700));
    const blockedRes = await emit(socket2, 'move', 'west');
    console.log('walking into a tree tile:', blockedRes.ok, blockedRes.player?.row, blockedRes.player?.col, 'expected tree at', nearEntrance.row, nearEntrance.col);
    check('a tree tile really blocks movement (item 5 collision)', blockedRes.ok === false);
    socket2.close();
  } else {
    console.log('no tree found close enough to the entrance to spot-check — skipping collision sub-check');
  }
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    sql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
