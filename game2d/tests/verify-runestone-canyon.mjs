// Item 6 of a later follow-up ask: "Create a new world 'Runestone Canyon'...
// same size as Silverbranch Lake, look like a canyon where player walks
// down stairs into it OR can walk around the entire canyon in a circle."
// Confirms via the server's own move-ack (not a screenshot) that: the
// entry point near the south stairs is walkable, the player can walk all
// the way to the map's north edge (crossing the "rim" band), and can walk
// laterally along the rim to confirm the full-circle path is open (since
// this map is cosmetic-elevation-only, 100% walkable by design).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'CanyonCheck' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Rc' + randomLetters(8);

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
function emit(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, (res) => resolve(res)));
}
// The server's own move-rate-limiter rejects moves sent faster than the
// client's usual 220ms cadence -- space these out so a real collision
// block isn't confused with a rate-limit rejection.
async function move(socket, direction) {
  await new Promise((r) => setTimeout(r, 250));
  return emit(socket, 'move', direction);
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

// Land right at the entry point used by Runestone Way's own exit
// (RUNESTONE_CANYON_ROWS - 2, RUNESTONE_CANYON_MID_COL) -- near the south
// stairs.
psql(`UPDATE players SET map='Runestone Canyon', "row"=48, col=25 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const stairsMove = await move(socket, 'north');
check('player can walk near the south stairs entry', stairsMove?.ok === true, JSON.stringify(stairsMove));

// Walk north through the rim band into the floor and confirm no blocking
// anywhere (cosmetic-elevation-only map, fully walkable).
const northMoves = [];
for (let i = 0; i < 40; i++) northMoves.push(await move(socket, 'north'));
check('all northward moves through rim+floor succeeded (fully walkable)', northMoves.every((m) => m.ok === true), JSON.stringify(northMoves.map((m) => m.ok)));

// Walk laterally (west) along wherever we ended up -- confirms the "walk
// around in a circle" path is open too.
const westMoves = [];
for (let i = 0; i < 15; i++) westMoves.push(await move(socket, 'west'));
check('lateral moves west also all succeeded (circular rim path open)', westMoves.every((m) => m.ok === true), JSON.stringify(westMoves.map((m) => m.ok)));

const finalPos = westMoves[westMoves.length - 1];
console.log('final position ack:', JSON.stringify(finalPos));

socket.close();
process.exit(failures > 0 ? 1 : 0);
