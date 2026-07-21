// Item 1 follow-up: confirms an expired auction with NO bids actually
// resolves (via the 5s server-side sweep) by returning the item to the
// seller's inventory.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function randChar(prefix) {
  const letters = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  return prefix + letters;
}
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

const uname = randChar('AhRes');
const charName = randChar('Ar');
const { token: accountToken } = await post('/auth/register', { username: uname, email: uname.toLowerCase() + '@example.com', password: 'testpass123' });
await post('/characters', { name: charName, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Floro Auction House', "row"=4, col=15, inventory='["a small canoe"]'::jsonb WHERE username='${charName}';`);
const { token: charToken } = await post(`/characters/${charName}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const listRes = await emit(socket, 'auctionListItem', { itemIndex: 0, startingGold: 50, durationMinutes: 1 });
check('listing succeeded', listRes?.ok === true, JSON.stringify(listRes));

console.log('waiting ~70s for the 1-minute auction to expire and resolve...');
await new Promise((r) => setTimeout(r, 70000));

const listingsRes = await emit(socket, 'auctionGetListings');
check('listing is gone after expiring', !listingsRes?.listings?.some((l) => l.sellerUsername === charName), JSON.stringify(listingsRes?.listings));

const dbCheck = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${charName}';"`).toString();
console.log('seller inventory after resolution:', dbCheck.trim());
check('the unsold item was returned to the seller\'s inventory', dbCheck.includes('a small canoe'), dbCheck.trim());

socket.close();
process.exit(failures > 0 ? 1 : 0);
