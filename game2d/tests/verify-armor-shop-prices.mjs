// Item 22: "Update Floro & Kortho armor shop: studded armor 10 gold each,
// cloth armor 5 gold each, opal and bone equipment 10 gold each."
// Confirms via the server's own vendor snapshot that both armorers now
// stock the full studded/cloth/opal sets plus bone ring/shield, at the
// requested prices.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'ArmorChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Ac' + randomLetters(8);

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
let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

async function getVendorItems(map, row, col, vendorId) {
  const uname = (UNAME + map.replace(/\s/g, '')).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: uname, email: `${uname}@example.com`.toLowerCase(), password: 'testpass123' });
  const thisChar = (CHAR + map.slice(0, 2)).slice(0, 16);
  await post('/characters', { name: thisChar, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(`UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${thisChar}';`);
  const { token: charToken } = await post(`/characters/${thisChar}/select`, {}, accountToken);
  const socket = await connect(charToken);
  const mapState = await new Promise((resolve) => {
    socket.on('map:state', (state) => {
      const vendor = state.vendors?.find((v) => v.id === vendorId);
      if (vendor) resolve(vendor);
    });
    setTimeout(() => resolve(null), 5000);
  });
  socket.close();
  return mapState?.items;
}

const priceOf = (items, label) => items?.find((i) => i.label === label)?.price;

for (const [mapName, vendorId] of [
  ['Floro Armorer', 'floro-armorer'],
  ['Kortho Armorer', 'kortho-armorer'],
]) {
  const items = await getVendorItems(mapName, 3, 15, vendorId);
  console.log(mapName, 'vendor items:', JSON.stringify(items));
  check(`${mapName}: studded armor is 10 gold`, priceOf(items, 'studded armor') === 10, JSON.stringify(items));
  check(`${mapName}: studded helmet is 10 gold`, priceOf(items, 'studded helmet') === 10);
  check(`${mapName}: cloth armor is 5 gold`, priceOf(items, 'cloth armor') === 5);
  check(`${mapName}: cloth helmet is 5 gold`, priceOf(items, 'cloth helmet') === 5);
  check(`${mapName}: opal ring is 10 gold`, priceOf(items, 'opal ring') === 10);
  check(`${mapName}: opal earrings is 10 gold`, priceOf(items, 'opal earrings') === 10);
  check(`${mapName}: opal necklace is 10 gold`, priceOf(items, 'opal necklace') === 10);
  check(`${mapName}: bone ring is 10 gold`, priceOf(items, 'bone ring') === 10);
  check(`${mapName}: bone shield is 10 gold`, priceOf(items, 'bone shield') === 10);
}

process.exit(failures > 0 ? 1 : 0);
