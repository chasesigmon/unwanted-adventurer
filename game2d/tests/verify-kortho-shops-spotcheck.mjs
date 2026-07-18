// Spot-check for batch item 9: confirms 2 more of the 7 new Kortho shop
// doors/vendors beyond the one already covered in verify-kortho-road.mjs
// (Blacksmith) — Jobs Office (greeting-only) and Pet Salesman
// (greeting-only) — to rule out a copy-paste mistake in one of the other
// 6 KORTHO_SHOP_DOORS/vendors.ts entries.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'KorthoShop' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Korthoshop' + rand2() + rand2();

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
function psql(sql) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
async function closeAndWait(socket) {
  socket.close();
  await new Promise((r) => setTimeout(r, 400));
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

  // Kortho Jobs Office door: { row: 42, col: 25 }.
  psql(`UPDATE players SET map='Kortho', "row"=42, col=25 WHERE username='${CHAR}';`);
  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  let res = await emit(socket, 'move', 'north');
  check('Kortho Jobs Office door leads into its own interior', res.ok === true && res.player?.map === 'Kortho Jobs Office');
  res = await emit(socket, 'move', 'north');
  for (let i = 0; i < 4; i++) res = await emit(socket, 'move', 'north');
  const jobsBuy = await emit(socket, 'buyItem', { vendorId: 'kortho-jobs-office', itemLabel: 'anything' });
  check('Kortho Jobs Office vendor is found (greeting-only, no items)', jobsBuy.ok === false && /doesn't sell/.test(jobsBuy.message || ''));

  // Kortho Pet Salesman door: { row: 32, col: 35 }.
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Kortho', "row"=32, col=35 WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  res = await emit(socket, 'move', 'north');
  check('Kortho Pet Salesman door leads into its own interior', res.ok === true && res.player?.map === 'Kortho Pet Salesman');
  for (let i = 0; i < 5; i++) res = await emit(socket, 'move', 'north');
  const petBuy = await emit(socket, 'buyItem', { vendorId: 'kortho-pet-salesman', itemLabel: 'anything' });
  check('Kortho Pet Salesman vendor is found (greeting-only, no items)', petBuy.ok === false && /doesn't sell/.test(petBuy.message || ''));

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
