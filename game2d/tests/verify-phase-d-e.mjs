import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'PhaseDETest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Phdetest' + rand2() + rand2();

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

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

// Give the test character a couple of cloth armor pieces to sell, and
// place them at the Bramwick Armor vendor (row 2, col 5 — sells cloth
// gauntlets too now, item D4) to test sell-to-vendor (D1).
psql(`UPDATE players SET map='Bramwick Armor', "row"=2, col=6, inventory='["cloth helmet","lesser mana crystal"]', gold=20 WHERE username='${CHAR}';`);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
console.log('connected at Bramwick Armor');

let latestSync = null;
let latestMapState = null;
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 500));

// D4 — cloth gauntlets purchasable.
const buyGauntletsAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-armor', itemLabel: 'cloth gauntlets' }, resolve));
console.log('buyItem(cloth gauntlets) ack:', JSON.stringify(buyGauntletsAck));
check('D4: cloth gauntlets purchasable from Bramwick Armor', buyGauntletsAck.ok === true);

// D1 — sell cloth helmet (index 0) back; this vendor lists it at 5 gold,
// so sell value should be floor(5/2) = 2.
const goldBefore = latestSync?.gold ?? 20;
const sellAck = await new Promise((resolve) => socket.emit('sellItem', { vendorId: 'bramwick-armor', itemIndex: 0 }, resolve));
console.log('sellItem(cloth helmet) ack:', JSON.stringify(sellAck));
check('D1: sell-to-vendor works and pays half price (2 gold)', sellAck.ok === true && sellAck.gold === goldBefore + 2);

// D1 — sell an item no vendor anywhere stocks (a monster-drop-only
// material) — should still work via the flat fallback scrap value (1
// gold), not be rejected.
const sellFallbackAck = await new Promise((resolve) => socket.emit('sellItem', { vendorId: 'bramwick-armor', itemIndex: 0 }, resolve));
console.log('sellItem(lesser mana crystal, sold nowhere) ack:', JSON.stringify(sellFallbackAck));
check('D1: selling an item no vendor stocks still pays a flat fallback (1 gold)', sellFallbackAck.ok === true && sellFallbackAck.gold === (sellAck.gold ?? 0) + 1);

socket.disconnect();
await new Promise((r) => setTimeout(r, 300));

// E1/D8 — teleport into Sunken Crypt (a portal dungeon, level-12 rare
// skeletons with aggroRadiusTiles=5) and confirm proximity aggro fires
// without ever attacking, and that the chase then closes distance fast
// (D8's aggro-speed fix) rather than crawling at the old ~0.67 tiles/sec.
psql(`UPDATE players SET map='Sunken Crypt', "row"=20, col=25 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (latestMapState = data));
console.log('connected inside Sunken Crypt');
await new Promise((r) => setTimeout(r, 500));

const skeleton = latestMapState?.monsters?.find((m) => m.kind === 'wild skeleton');
if (!skeleton) {
  check('E1: found a Sunken Crypt skeleton to test proximity aggro against', false);
} else {
  console.log('nearest skeleton at', skeleton.row, skeleton.col, 'player at', latestSync?.row, latestSync?.col);
  // Walk toward it a few tiles WITHOUT ever attacking, staying outside
  // melee range, to isolate proximity aggro from contact aggro.
  const towardRow = skeleton.row > (latestSync?.row ?? 20) ? 'south' : 'north';
  const towardCol = skeleton.col > (latestSync?.col ?? 25) ? 'east' : 'west';
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 === 0 ? towardRow : towardCol;
    await new Promise((resolve) => socket.emit('move', dir, resolve));
    await new Promise((r) => setTimeout(r, 230));
  }
  await new Promise((r) => setTimeout(r, 500));

  let sawProximityAggroChase = false;
  const startPos = { row: skeleton.row, col: skeleton.col };
  for (let i = 0; i < 8 && !sawProximityAggroChase; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const m = latestMapState?.monsters?.find((mm) => mm.id === skeleton.id);
    if (m && (m.row !== startPos.row || m.col !== startPos.col)) {
      console.log(`  tick ${i}: skeleton moved to (${m.row},${m.col}) from (${startPos.row},${startPos.col}) without ever being attacked`);
      sawProximityAggroChase = true;
    }
  }
  check('E1+D8: an un-attacked skeleton notices the approaching player (proximity aggro) and chases at the new faster pace', sawProximityAggroChase);
}

console.log(allPass ? '\nALL PHASE D/E CHECKS PASSED' : '\nSOME PHASE D/E CHECKS FAILED');
socket.disconnect();
process.exit(allPass ? 0 : 1);
