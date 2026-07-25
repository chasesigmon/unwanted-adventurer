// Follow-up bug report: "I am still able to rename my tamed beast even
// though it has already been named." Verifies the server actually
// rejects a second rename attempt with the permanent-name message.
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
    payload === undefined
      ? socket.timeout(5000).emit(event, (err, res) => (err ? reject(err) : resolve(res)))
      : socket.timeout(5000).emit(event, payload, (err, res) => (err ? reject(err) : resolve(res)))
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

const CHAR = 'TbR' + randomLetters(6);
const UNAME = ('TbR' + randomLetters(6)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
const tamedBeastJson = JSON.stringify({
  id: 'test-beast-1',
  ownerUsername: CHAR,
  kind: 'wolf',
  name: 'Fang',
  level: 1,
  hp: 20,
  maxHp: 20,
  attackDamage: 3,
  map: 'Great Plains',
  row: 10,
  col: 10,
  command: 'follow',
}).replace(/'/g, "''");
psql(`UPDATE players SET map='Great Plains', "row"=10, col=10, tamed_beast='${tamedBeastJson}'::jsonb WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const { socket } = await connect(charToken);

const firstAck = await emit(socket, 'renameTamedBeast', { name: 'Rex' });
check('first rename succeeds', firstAck.ok === true && firstAck.tamedBeast?.name === 'Rex', JSON.stringify(firstAck));
check('first rename ack marks named:true', firstAck.tamedBeast?.named === true, JSON.stringify(firstAck));

const secondAck = await emit(socket, 'renameTamedBeast', { name: 'AnotherName' });
check('second rename is rejected', secondAck.ok === false, JSON.stringify(secondAck));
check('second rename gives the permanent-name message', secondAck.message === 'Your tamed beast already has a permanent name.', JSON.stringify(secondAck));

socket.close();
psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
process.exit(failures > 0 ? 1 : 0);
