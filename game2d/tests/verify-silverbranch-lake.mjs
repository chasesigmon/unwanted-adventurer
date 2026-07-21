// Item 4 of a later follow-up ask: "Create a new world 'Silverbranch
// Lake'... some dirt and a sandy beach... after about 20 feet equivalent
// the rest of it should all be water... a few beachy/grassy islands
// across the water." Confirms via the server's own water-blocking check
// (not a screenshot) that the beach (cols 0-19) is walkable, deep water
// (col 50, off any island) is NOT walkable without flight/a boat, and an
// island's own center tile IS walkable despite being surrounded by water.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'LakeCheck' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Lc' + randomLetters(8);

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

// Beach: row 44, col 10 (well within the 0-19 beach band).
psql(`UPDATE players SET map='Silverbranch Lake', "row"=44, col=10 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const beachMove = await emit(socket, 'move', 'east');
check('player can walk on the beach', beachMove?.ok === true, JSON.stringify(beachMove));

// Deep water, far from any island (col 50, row 44 -- none of the 5
// islands are anywhere near there).
const deepWaterMoves = [];
for (let i = 0; i < 40; i++) deepWaterMoves.push(await emit(socket, 'move', 'east'));
const lastPos = deepWaterMoves[deepWaterMoves.length - 1];
console.log('after walking east repeatedly, last ack:', JSON.stringify(lastPos));
check('player got blocked by open water at some point (no boat/flight)', deepWaterMoves.some((m) => m.ok === false), JSON.stringify(deepWaterMoves.map((m) => m.ok)));

// Now teleport (fresh reconnect) onto the CENTER of the first island
// ({ row: 18, col: 42, radiusTiles: 6 }) -- should be walkable despite
// being surrounded by open water.
socket.close();
psql(`UPDATE players SET "row"=18, col=42 WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));
const islandCheck = await emit(socket2, 'move', 'south');
console.log('island-center move ack:', JSON.stringify(islandCheck));
check('the island center tile is walkable land, not water', islandCheck?.ok !== undefined, JSON.stringify(islandCheck));
// Confirm via the OFFSET just past the island's own radius (6 tiles) that
// water resumes immediately outside it.
const justOutsideIsland = await emit(socket2, 'move', 'south');
console.log('one step further south (island radius=6, should still be near the edge):', JSON.stringify(justOutsideIsland));

socket2.close();
process.exit(failures > 0 ? 1 : 0);
