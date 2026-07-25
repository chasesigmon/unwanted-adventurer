// Item 2 (follow-up batch): "The crafting table should have collision."
// Verifies a player can't walk onto the crafting table's own tile in
// Bramwick Crafting Shop (table at (4,8) — see shared/lighting.ts's
// craftingTablePositionFor), only reach it from an adjacent tile.
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

const CHAR = 'ColT' + randomLetters(6);
const UNAME = ('ColT' + randomLetters(6)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Table is at (4,8) — start one tile west, at (4,7), and try to step east onto it.
psql(`UPDATE players SET map='Bramwick Crafting Shop', "row"=4, col=7 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const { socket } = await connect(charToken);

const moveAck = await emit(socket, 'move', 'east');
console.log('move onto table ack:', JSON.stringify({ ok: moveAck.ok, row: moveAck.player?.row, col: moveAck.player?.col, message: moveAck.message }));
const blocked = moveAck.player.row === 4 && moveAck.player.col === 7;
console.log(blocked ? 'PASS: player did NOT move onto the table (blocked)' : 'FAIL: player moved onto the table (' + moveAck.player.row + ',' + moveAck.player.col + ')');

socket.close();
psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
process.exit(blocked ? 0 : 1);
