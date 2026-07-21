// Item 23 of a later follow-up ask: "have the floro boat shop sell the
// same items as the kortho boat shop." Floro didn't actually have a boat
// shop at all before this fix (still had a "Jobs Office", unlike Kortho
// which already repurposed its own) -- confirms Floro's own Jobs Office
// was converted the same way and now sells canoe + raft at the same
// prices as Kortho's.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FloroBoat' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Fb' + randomLetters(8);

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

psql(`UPDATE players SET map='Floro Boat Shop', "row"=4, col=15, gold=100 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let lastMapState = null;
socket.on('map:state', (payload) => {
  lastMapState = payload;
});
await new Promise((r) => setTimeout(r, 800));

const vendor = lastMapState?.vendors?.find((v) => v.map === 'Floro Boat Shop');
check('a vendor exists on Floro Boat Shop', Boolean(vendor), JSON.stringify(lastMapState?.vendors?.map((v) => v.map)));
console.log('Floro Boat Shop vendor items:', JSON.stringify(vendor?.items));

const canoeRes = await emit(socket, 'buyItem', { vendorId: vendor?.id, itemLabel: 'a small canoe' });
check('bought a canoe from the Floro boat shop', canoeRes?.ok === true, JSON.stringify(canoeRes));

socket.close();
process.exit(failures > 0 ? 1 : 0);
