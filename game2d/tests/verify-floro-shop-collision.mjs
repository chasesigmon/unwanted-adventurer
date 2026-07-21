// Item 20: "Floro shops (Kortho seems fine) lost full building collision
// — only the door blocks now, rest of building is walkable through."
// Root cause: Floro's shop buildings were switched onto the same (bigger)
// KORTHO_SHOP_TEXTURE_KEY spritesheet Kortho uses, but the collision
// footprint (isShopBuildingBlocked) was never updated to match, staying
// at the old, smaller timber-shopfront dimensions (3x4 instead of 6x8).
// Confirms via the server's own move-ack that a tile well inside the
// Floro Blacksmith's building footprint (door at row 15, col 10; building
// spans rows 8-14, cols 7-14) is now genuinely blocked, matching Kortho's
// own already-working behavior at the equivalent spot.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FloroChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Fc' + randomLetters(8);

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
function move(socket, direction) {
  return new Promise((resolve) => {
    setTimeout(() => socket.emit('move', direction, (res) => resolve(res)), 250);
  });
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

// Just outside the building's own east edge -- shopBuildingFootprint(door
// {row:15,col:10}, 6, 8) blocks rows 8-14, cols 7-12 (halfWidth=3: dCol
// -3..2). Starting at col 13 (just outside), walking west into col 12
// should now be blocked.
psql(`UPDATE players SET map='Floro', "row"=10, col=13 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const westMove = await move(socket, 'west');
console.log('move west from just outside the building ack:', JSON.stringify({ ok: westMove.ok, row: westMove.player?.row, col: westMove.player?.col }));
check('walking from col 13 into the building (col 12) is now blocked', westMove.ok === false, JSON.stringify({ ok: westMove.ok, row: westMove.player?.row, col: westMove.player?.col }));

// The door tile itself (row 15, col 10, NOT part of the blocked footprint
// -- dRow starts at 1, so row 15 itself is excluded) must still be
// walkable, same as before this fix.
socket.close();
psql(`UPDATE players SET map='Floro', "row"=16, col=10 WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));
const doorMove = await move(socket2, 'north');
console.log('move north onto the door tile ack:', JSON.stringify({ ok: doorMove.ok, row: doorMove.player?.row, col: doorMove.player?.col }));
check('the door tile itself (row 15, col 10) is still walkable', doorMove.ok === true, JSON.stringify({ ok: doorMove.ok, row: doorMove.player?.row, col: doorMove.player?.col }));

socket2.close();
process.exit(failures > 0 ? 1 : 0);
