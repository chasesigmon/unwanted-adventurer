// A later follow-up bug fix: "players are able to use diagonal navigation
// to cross through collision boundaries." Root cause:
// WorldManagerService.processDiagonalMove only ever checked the SINGLE
// final diagonal destination tile for collision, never the two orthogonal
// tiles flanking that diagonal step -- the classic corner-cutting bug: a
// tile diagonally reachable can still be walled off if either flanking
// tile is solid (an L-shaped wall corner), and the old code let a player
// slip through that gap anyway.
//
// This finds a REAL corner in the Labyrinth's own procedurally-generated
// maze (isLabyrinthWallTile) where the diagonal destination is open but
// one of the two flanking tiles is a wall, then drives an actual
// moveDiagonal socket call against it to confirm the move is now
// rejected -- and a nearby fully-open diagonal step still succeeds, so
// the fix doesn't overzealously block legitimate diagonal movement.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { isLabyrinthWallTile } from '../shared/labyrinthMaze.js';

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
// handleConnection on the server does an async DB fetch before it
// finishes populating client.data (equipment, stats, etc.) -- the
// socket's own 'connect' event fires as soon as the handshake completes,
// which can be BEFORE that server-side setup is done. A real player's
// client always waits for the initial 'sync' payload before allowing any
// input; this test does the same rather than racing a move command
// against handleConnection's own async setup.
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res)));
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

// Find a real corner: player at (r,c), moving NW to (r-1,c-1); dest and
// origin both open, but one flanking tile (r-1,c) or (r,c-1) is a wall.
let corner = null;
for (let r = 1; r < 59 && !corner; r++) {
  for (let c = 1; c < 59 && !corner; c++) {
    const dest = { row: r - 1, col: c - 1 };
    const f1Blocked = isLabyrinthWallTile('Labyrinth', r - 1, c);
    const f2Blocked = isLabyrinthWallTile('Labyrinth', r, c - 1);
    const destBlocked = isLabyrinthWallTile('Labyrinth', dest.row, dest.col);
    const originBlocked = isLabyrinthWallTile('Labyrinth', r, c);
    if (!destBlocked && !originBlocked && (f1Blocked || f2Blocked)) {
      corner = { origin: { row: r, col: c }, dest };
    }
  }
}
if (!corner) throw new Error('could not find a corner-cut scenario in the Labyrinth to test against');
console.log('testing corner-cut at', JSON.stringify(corner));

// Also find a fully-open diagonal (both flanks clear) near the corner, as
// a control case that should still succeed.
let openDiagonal = null;
for (let r = 1; r < 59 && !openDiagonal; r++) {
  for (let c = 1; c < 59 && !openDiagonal; c++) {
    const dest = { row: r - 1, col: c - 1 };
    const f1Blocked = isLabyrinthWallTile('Labyrinth', r - 1, c);
    const f2Blocked = isLabyrinthWallTile('Labyrinth', r, c - 1);
    const destBlocked = isLabyrinthWallTile('Labyrinth', dest.row, dest.col);
    const originBlocked = isLabyrinthWallTile('Labyrinth', r, c);
    if (!destBlocked && !originBlocked && !f1Blocked && !f2Blocked) {
      openDiagonal = { origin: { row: r, col: c }, dest };
    }
  }
}
if (!openDiagonal) throw new Error('could not find a fully-open diagonal control scenario');
console.log('testing open diagonal control at', JSON.stringify(openDiagonal));

const CHAR = 'Dg' + randomLetters(8);
const UNAME = ('Dg' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

// Test 1: the corner-cut scenario should now be BLOCKED.
psql(`UPDATE players SET map='Labyrinth', "row"=${corner.origin.row}, col=${corner.origin.col} WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket1 = await connect(charToken);
const dRow1 = corner.dest.row - corner.origin.row;
const dCol1 = corner.dest.col - corner.origin.col;
const ack1 = await emit(socket1, 'moveDiagonal', { dRow: dRow1, dCol: dCol1 });
console.log('corner-cut move ack:', JSON.stringify(ack1?.player ? { ok: ack1.ok, row: ack1.player.row, col: ack1.player.col } : ack1));
check(
  'the corner-cut diagonal move is rejected (player stays at origin)',
  ack1.player.row === corner.origin.row && ack1.player.col === corner.origin.col,
  `expected to stay at ${JSON.stringify(corner.origin)}, got row=${ack1.player.row} col=${ack1.player.col}`
);
socket1.close();
await new Promise((r) => setTimeout(r, 300));

// Test 2: a fully-open diagonal (control case) should still succeed.
psql(`UPDATE players SET map='Labyrinth', "row"=${openDiagonal.origin.row}, col=${openDiagonal.origin.col} WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
const dRow2 = openDiagonal.dest.row - openDiagonal.origin.row;
const dCol2 = openDiagonal.dest.col - openDiagonal.origin.col;
const ack2 = await emit(socket2, 'moveDiagonal', { dRow: dRow2, dCol: dCol2 });
console.log('open diagonal move ack:', JSON.stringify(ack2?.player ? { ok: ack2.ok, row: ack2.player.row, col: ack2.player.col } : ack2));
check(
  'a fully-open diagonal move (no flanking walls) still succeeds (fix is not overzealous)',
  ack2.player.row === openDiagonal.dest.row && ack2.player.col === openDiagonal.dest.col,
  `expected to reach ${JSON.stringify(openDiagonal.dest)}, got row=${ack2.player.row} col=${ack2.player.col}`
);
socket2.close();

execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "DELETE FROM players WHERE username='${CHAR}';"`, { stdio: 'pipe' });
execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "DELETE FROM accounts WHERE username='${UNAME}';"`, { stdio: 'pipe' });

process.exit(failures > 0 ? 1 : 0);
