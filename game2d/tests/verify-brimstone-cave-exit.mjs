// Item 12: "Update Brimstone Cave: exit to Bramwick should be on the EAST
// of the cave, cave exit sprite facing WEST for the player — move the
// sign too" (explicitly reversing an earlier "make the cave exit face
// west" fix). Confirms via the server's own move-ack that walking east
// from the cave's middle reaches the Bramwick exit at the EAST edge
// (col BRIMSTONE_CAVE_SIZE - 1), and that the west edge (col 0) is now
// just open cave floor, not an exit.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'BrimChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Bc' + randomLetters(8);

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

// Start well west of center, in the middle row -- walking east all the
// way should now cross the whole cave and land in Bramwick via the NEW
// east-edge exit.
psql(`UPDATE players SET map='Brimstone Cave', "row"=50, col=5 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

let lastAck;
for (let i = 0; i < 110; i++) {
  lastAck = await move(socket, 'east');
  if (lastAck.player?.map === 'Bramwick') break;
}
console.log('final ack after walking east:', JSON.stringify({ map: lastAck.player?.map, row: lastAck.player?.row, col: lastAck.player?.col }));
check('walking east from the cave now reaches Bramwick (east-edge exit)', lastAck.player?.map === 'Bramwick', JSON.stringify(lastAck.player?.map));

// Confirm the west edge is now just open floor, not an exit: teleport
// there and try to walk further west (off the map) -- should just fail
// to move (edge of map), NOT transition to Bramwick.
socket.close();
psql(`UPDATE players SET map='Brimstone Cave', "row"=13, col=1 WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));
const westAck = await move(socket2, 'west');
console.log('west-edge move ack:', JSON.stringify({ ok: westAck.ok, map: westAck.player?.map }));
check('the west edge is no longer an exit (still in Brimstone Cave, not Bramwick)', westAck.player?.map === 'Brimstone Cave', JSON.stringify(westAck.player?.map));

socket2.close();
process.exit(failures > 0 ? 1 : 0);
