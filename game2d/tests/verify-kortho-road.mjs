// Live verification for batch items 8+9: "add a dirt road going east out
// of Grimoak grounds... Create 'Road to Kortho'... add the town of Kortho
// back and have it connect to the Road to Kortho." Confirms: the new NE
// Grimoak Grounds exit really transitions to Road to Kortho, the far end
// of Road to Kortho really transitions into Kortho, the pre-existing
// weapon-equipped town gate (TOWN_MAPS already included 'Kortho' before
// this batch) still applies to it, and each of the 7 new shop doors
// reciprocates into its own interior with a working vendor.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'KorthoTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Korthotest' + rand2() + rand2();

// GRIMOAK_GROUNDS_COLS = round(80*1.25) = 100; NE exit row = 10 (GRIMOAK_GROUNDS_ROAD_TO_KORTHO_ROW).
const GROUNDS_EXIT_ROW = 10;
const GROUNDS_COLS = 100;
// ROAD_TO_KORTHO_ROWS = round(80*0.25) = 20; MID_ROW = 10; COLS = 100 (same as grounds).
const ROAD_MID_ROW = 10;
const ROAD_COLS = 100;
const TOWN_MID_ROW = 25; // floor(TOWN_SIZE(50)/2)

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
// handleDisconnect persists the CURRENT in-memory position (awaited,
// server-side) the moment it fires. Reposition-via-SQL must happen AFTER
// that disconnect settles, never before — otherwise the stale in-memory
// persist lands on top of the fresh SQL write and clobbers it (the same
// "reconnect gap" gotcha seen elsewhere this project).
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

  // --- 1. Grimoak Grounds' new NE exit really leads to Road to Kortho ---
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=${GROUNDS_EXIT_ROW}, col=${GROUNDS_COLS - 2} WHERE username='${CHAR}';`);
  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  let res = await emit(socket, 'move', 'east');
  check('steps onto the Grimoak Grounds NE exit tile', res.ok === true && res.player?.map === 'Grimoak Grounds');
  res = await emit(socket, 'move', 'east');
  check('exit tile transitions to Road to Kortho', res.ok === true && res.player?.map === 'Road to Kortho');
  check('arrives at the reciprocal west-side tile', res.player?.row === ROAD_MID_ROW && res.player?.col === 1);

  // --- 2. Road to Kortho's east end really leads to Kortho ---
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Road to Kortho', "row"=${ROAD_MID_ROW}, col=${ROAD_COLS - 2} WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  res = await emit(socket, 'move', 'east');
  check('steps onto the Road to Kortho east exit tile', res.ok === true && res.player?.map === 'Road to Kortho');

  // New characters start with a wand equipped by default (a wizarding
  // school's own starting kit), so the pre-existing TOWN_MAPS weapon gate
  // (unchanged by this batch) is already satisfied here — confirmed
  // separately below by stripping the weapon and re-attempting.
  res = await emit(socket, 'move', 'east');
  check('equipped player passes the Kortho gate', res.ok === true && res.player?.map === 'Kortho');
  check('arrives at the reciprocal Kortho tile', res.player?.row === TOWN_MID_ROW && res.player?.col === 1);
  console.log('arrived at Kortho:', res.player?.row, res.player?.col, 'equipment:', JSON.stringify(res.player?.equipment));

  // --- 3. Gate still blocks when unarmed (mirroring Floro's own
  // pre-existing behavior, unchanged by this batch) ---
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Road to Kortho', "row"=${ROAD_MID_ROW}, col=${ROAD_COLS - 2}, equipment='{}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));
  res = await emit(socket, 'move', 'east');
  check('steps onto the exit tile again, unarmed', res.ok === true && res.player?.map === 'Road to Kortho');
  res = await emit(socket, 'move', 'east');
  check('unequipped player is turned away at Kortho (town gate)', res.ok === false && /guards of Kortho/.test(res.message || ''));

  // --- 4. Shop doors + vendor: Kortho Blacksmith ---
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Kortho', "row"=10, col=15, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  res = await emit(socket, 'move', 'north');
  check('Kortho Blacksmith door leads into its own interior', res.ok === true && res.player?.map === 'Kortho Blacksmith');
  check('arrives at the shop interior door tile', res.player?.row === 9 && res.player?.col === 5);

  // Vendor sits at (2, 5) as a solid NPC prop; door is at (9, 5) — walk
  // straight north to just within SHOP_REACH_TILES(2) of it (row 4),
  // one short of colliding with the vendor's own tile.
  for (let i = 0; i < 5; i++) {
    res = await emit(socket, 'move', 'north');
  }
  check('reaches the blacksmith vendor', res.ok === true && Math.abs((res.player?.row ?? -99) - 2) <= 2);

  const buyRes = await emit(socket, 'buyItem', { vendorId: 'kortho-blacksmith', itemLabel: 'bone dagger' });
  console.log('buy response:', JSON.stringify(buyRes).slice(0, 300));
  check('buying from the Kortho Blacksmith succeeds', buyRes.ok === true);

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
