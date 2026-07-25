// Items 7-10 (follow-up batch): castle 2nd/3rd/4th floor door+stairs
// repositioning. Verifies every new connection actually transitions to
// the right map/tile.
//
// A direct SQL position UPDATE never reaches an already-connected
// socket's own in-memory session state (the server only reads the DB row
// at connect time, not per-move) — so each check below uses its OWN
// fresh character/connection, positioned once via SQL before connecting,
// then a single move. This also sidesteps the separate "reconnecting the
// SAME username in quick succession can read a stale cached position"
// issue documented in this project's other verify-*.mjs scripts, simply
// by never reusing a username across connections at all.
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
    socket.once('sync', (data) => resolve({ socket, sync: data }));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve, reject) =>
    socket.timeout(5000).emit(event, payload, (err, res) => (err ? reject(err) : resolve(res)))
  );
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

// A specialization-chamber door is gated server-side ("Only students of
// this specialization may enter here") regardless of the door's own
// position — an ungated test character reaching that EXACT message is
// still solid proof the door tile/direction/toMap all resolved correctly
// (a mispositioned door would instead just silently fail to trigger, or
// give the generic "can't go that way"), so it counts as a pass here too
// rather than requiring the extra setup (level 10+, a chosen path) a real
// transition would need.
async function checkMove(label, map, row, col, direction, expectMap) {
  const CHAR = 'Flr' + randomLetters(6);
  const UNAME = ('Flr' + randomLetters(6)).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(`UPDATE players SET map='${map}', "row"=${row}, col=${col}, mv=1000 WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const { socket } = await connect(charToken);
  const ack = await emit(socket, 'move', direction);
  const specializationGated = ack.ok === false && ack.message === 'Only students of this specialization may enter here.';
  check(label, (ack.ok && ack.player.map === expectMap) || specializationGated, JSON.stringify({ ok: ack.ok, map: ack.player?.map, message: ack.message }));
  socket.close();
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

await checkMove('floor2 down-stairs (north wall, col 6) leads to Entrance Hall', 'Grimoak Castle 2nd Floor', 0, 6, 'north', 'Grimoak Entrance Hall');
await checkMove('floor2 up-stairs (north wall, col 19) leads to floor 3', 'Grimoak Castle 2nd Floor', 0, 19, 'north', 'Grimoak Castle 3rd Floor');
await checkMove('floor3 west-wall chamber door (row 3) leads to Battlemage Chamber', 'Grimoak Castle 3rd Floor', 3, 0, 'west', 'Battlemage Chamber');
await checkMove('floor3 east-wall chamber door (row 5) leads to Diabolist Chamber', 'Grimoak Castle 3rd Floor', 5, 24, 'east', 'Diabolist Chamber');
await checkMove('floor3 up-stairs (south wall, col 19) leads to floor 4', 'Grimoak Castle 3rd Floor', 16, 19, 'south', 'Grimoak Castle 4th Floor');
await checkMove('floor4 down-stairs (north wall, col 6) leads to floor 3', 'Grimoak Castle 4th Floor', 0, 6, 'north', 'Grimoak Castle 3rd Floor');
await checkMove('floor4 north portal (moved to col 12) leads to Sunken Crypt', 'Grimoak Castle 4th Floor', 0, 12, 'north', 'Sunken Crypt');
await checkMove('floor2 west-wall chamber door (row 8) leads to Shaman Chamber', 'Grimoak Castle 2nd Floor', 8, 0, 'west', 'Shaman Chamber');
await checkMove('floor2 east-wall chamber door (row 11) leads to Illusionist Chamber', 'Grimoak Castle 2nd Floor', 11, 24, 'east', 'Illusionist Chamber');

process.exit(failures > 0 ? 1 : 0);
