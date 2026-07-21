// Item 25: "Only armor equipment sellable to armorer; only weapons
// (wands/swords/shields/etc) sellable at blacksmith; everything else
// sellable at general store; nothing sellable at other shops (including
// Bramwick)." Confirms via direct socket sells that: a weapon can't be
// sold at the armorer, an armor piece CAN be sold at the armorer, a
// weapon CAN be sold at the blacksmith, a general item CAN be sold at
// the general store, and nothing at all can be sold at the bank (an
// "other shop").
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

async function freshSocket(uname, mapName, inventory) {
  const email = `${uname}@example.com`.toLowerCase();
  const { token: accountToken } = await post('/auth/register', { username: uname, email, password: 'testpass123' });
  await post('/characters', { name: uname, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(`UPDATE players SET map='${mapName}', "row"=3, col=15, inventory='${JSON.stringify(inventory)}' WHERE username='${uname}';`);
  const { token: charToken } = await post(`/characters/${uname}/select`, {}, accountToken);
  const socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 500));
  return socket;
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const rand = () => randomLetters(6);

// 1. A weapon (bone dagger) at the armorer should be rejected.
{
  const socket = await freshSocket('SellA' + rand(), 'Floro Armorer', ['bone dagger']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-armorer', itemIndex: 0 });
  console.log('weapon at armorer:', JSON.stringify(ack));
  check('bone dagger (weapon) CANNOT be sold at the armorer', ack.ok === false, JSON.stringify(ack));
  socket.close();
}

// 2. An armor piece at the armorer should succeed.
{
  const socket = await freshSocket('SellB' + rand(), 'Floro Armorer', ['cloth armor']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-armorer', itemIndex: 0 });
  console.log('armor at armorer:', JSON.stringify(ack));
  check('cloth armor CAN be sold at the armorer', ack.ok === true, JSON.stringify(ack));
  socket.close();
}

// 3. A weapon at the blacksmith should succeed.
{
  const socket = await freshSocket('SellC' + rand(), 'Floro Blacksmith', ['bone dagger']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-blacksmith', itemIndex: 0 });
  console.log('weapon at blacksmith:', JSON.stringify(ack));
  check('bone dagger CAN be sold at the blacksmith', ack.ok === true, JSON.stringify(ack));
  socket.close();
}

// 4. A general item (torch) at the general store should succeed.
{
  const socket = await freshSocket('SellD' + rand(), 'Floro General Store', ['torch']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-general-store', itemIndex: 0 });
  console.log('torch at general store:', JSON.stringify(ack));
  check('torch CAN be sold at the general store', ack.ok === true, JSON.stringify(ack));
  socket.close();
}

// 5. A general item (torch) at the armorer should be rejected.
{
  const socket = await freshSocket('SellE' + rand(), 'Floro Armorer', ['torch']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-armorer', itemIndex: 0 });
  console.log('torch at armorer:', JSON.stringify(ack));
  check('torch CANNOT be sold at the armorer (carved out of the weapon/shield slot it shares)', ack.ok === false, JSON.stringify(ack));
  socket.close();
}

// 6. Nothing at all sellable at "other shops" -- the bank.
{
  const socket = await freshSocket('SellF' + rand(), 'Floro Bank', ['cloth armor']);
  const ack = await emit(socket, 'sellItem', { vendorId: 'floro-bank', itemIndex: 0 });
  console.log('anything at the bank:', JSON.stringify(ack));
  check('nothing at all can be sold at the bank (an "other shop")', ack.ok === false, JSON.stringify(ack));
  socket.close();
}

process.exit(failures > 0 ? 1 : 0);
