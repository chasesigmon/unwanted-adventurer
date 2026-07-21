// Item 3 of a later follow-up ask: "when the player tries to go diagonally
// through a door/entrance it says 'You can't go that way' — the player
// should be able to go through the door if they are walking that way
// diagonally as well." Confirms moveDiagonal now transitions maps when the
// diagonal step's cardinal components include the door's own direction.
// Run with `node tests/verify-diagonal-door-transition.mjs` against the
// live dev server — requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'DiagDoor' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Diagdoortest' + ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'pipe' });
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
// The castle's main door on Grimoak Grounds sits at (55, 40), direction
// 'north', leading to 'Grimoak Entrance Hall'. Placing the player exactly
// ON that door tile and stepping northWEST should still trigger the
// transition (north is one of the diagonal's two cardinal components).
psql(`UPDATE players SET map='Grimoak Grounds', "row"=55, col=40 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));

const res = await emit(socket, 'moveDiagonal', { dRow: -1, dCol: -1 });
check('diagonal step through the door acked ok', res?.ok === true, JSON.stringify(res));
check('diagonal step through the door transitioned to Grimoak Entrance Hall', res?.player?.map === 'Grimoak Entrance Hall', `map=${res?.player?.map}`);

process.exit(failures > 0 ? 1 : 0);
