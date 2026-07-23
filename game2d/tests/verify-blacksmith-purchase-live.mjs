// Live end-to-end companion to verify-blacksmith-wands-swords.mjs's pure
// unit checks -- actually buys a new wand and a new sword from Floro's
// blacksmith through a real socket connection, confirming the purchase
// flow (shop-reach check, gold deduction, inventory) works for these new
// items, not just that their data is correctly defined.
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

const CHAR = 'Bk' + randomLetters(8);
const UNAME = ('Bk' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Floro Blacksmith', "row"=3, col=15, gold=100 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const wandAck = await emit(socket, 'buyItem', { vendorId: 'floro-blacksmith', itemLabel: 'wand of luck' });
console.log('buy "wand of luck" ack:', JSON.stringify(wandAck));
check('buying "wand of luck" from Floro blacksmith succeeds', wandAck.ok === true, JSON.stringify(wandAck));
check('gold decreased by 10 after buying the wand', wandAck.gold === 90, `got gold=${wandAck.gold}`);
check('the wand is now in inventory', wandAck.inventory?.includes('wand of luck'));

const swordAck = await emit(socket, 'buyItem', { vendorId: 'floro-blacksmith', itemLabel: 'sword of strength' });
console.log('buy "sword of strength" ack:', JSON.stringify(swordAck));
check('buying "sword of strength" from Floro blacksmith succeeds', swordAck.ok === true, JSON.stringify(swordAck));
check('gold decreased by another 10 after buying the sword', swordAck.gold === 80, `got gold=${swordAck.gold}`);
check('the sword is now in inventory', swordAck.inventory?.includes('sword of strength'));

socket.close();
execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "DELETE FROM players WHERE username='${CHAR}';"`, { stdio: 'pipe' });
execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "DELETE FROM accounts WHERE username='${UNAME}';"`, { stdio: 'pipe' });

process.exit(failures > 0 ? 1 : 0);
