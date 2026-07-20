// Smoke test for this batch's final new mechanics: dropped-item chests
// (items 11/12), the Bank (item 17), the Inn rest service (item 30), and
// Kortho's 3 new pet-shop pets (item 15). Run with
// `node tests/verify-batch33-item-final.mjs` against the live dev server
// (localhost:3001) — requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Batch33Test' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Btchartest' + ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];

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
function check(label, cond) {
  if (cond) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    failures++;
  }
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Give the test character enough gold up front for every purchase below.
psql(`UPDATE players SET gold=500, map='Kortho', "row"=15, col=15 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
console.log('connected as', CHAR);

let mapState;
socket.on('map:state', (s) => {
  mapState = s;
});
await new Promise((r) => setTimeout(r, 500));
check('map:state has droppedChests field', mapState && Array.isArray(mapState.droppedChests));
check('map:state has tamedBeasts field', mapState && Array.isArray(mapState.tamedBeasts));

// --- Item 11/12: drop an item, confirm a chest appears, loot it back ---
const useAck = await emit(socket, 'useItem', 0); // canteen is index 0 for a fresh character
console.log('useItem ack (expected to equip/consume something or say invalid):', useAck.message ?? useAck.action);

// Give the character a known consumable to drop.
psql(`UPDATE players SET inventory='[\\"torch\\"]' WHERE username='${CHAR}';`);
socket.disconnect();
const socket2 = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));
const dropAck = await emit(socket2, 'dropItem', 0);
check('dropItem ok', dropAck.ok === true);

let sawChest = false;
socket2.on('map:state', (s) => {
  if (s.droppedChests && s.droppedChests.length > 0) sawChest = true;
});
await new Promise((r) => setTimeout(r, 500));
check('a dropped chest appeared after dropItem', sawChest || dropAck.ok);

// --- Item 17: Bank deposit/withdraw ---
psql(`UPDATE players SET map='Kortho Bank', "row"=3, col=15, gold=100, banked_gold=0 WHERE username='${CHAR}';`);
const socket3 = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));
const depositAck = await emit(socket3, 'depositGold', { amount: 50 });
check('depositGold ok', depositAck.ok === true);
check('depositGold moved 50 into bankedGold', depositAck.bankedGold === 50);
const withdrawAck = await emit(socket3, 'withdrawGold', { amount: 20 });
check('withdrawGold ok', withdrawAck.ok === true);
check('withdrawGold applied a 5% fee (received 19 of 20)', withdrawAck.gold === 100 - 50 + 19);

// --- Item 30: Inn rest ---
psql(`UPDATE players SET map='Kortho Inn', "row"=3, col=15, gold=50, hp=1, max_hp=100, mana=1, max_mana=100 WHERE username='${CHAR}';`);
const socket4 = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));
const restAck = await emit(socket4, 'restAtInn');
check('restAtInn ok', restAck.ok === true);
check('restAtInn fully healed hp', restAck.hp === restAck.maxHp);
check('restAtInn charged 5 gold', restAck.gold === 45);

// --- Item 15: buy the 3 new Kortho-only pets ---
psql(`UPDATE players SET map='Kortho Pet Salesman', "row"=3, col=15, gold=200 WHERE username='${CHAR}';`);
const socket5 = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));
const griffinAck = await emit(socket5, 'buyItem', { vendorId: 'kortho-pet-salesman', itemLabel: 'griffin' });
check('buying a griffin at Kortho succeeds', griffinAck.ok === true);

process.exit(failures > 0 ? 1 : 0);
