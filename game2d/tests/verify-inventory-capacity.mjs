// Item 29: "Every new player should start out with a max number of items
// allowed as a base of 20 items... a formula created that is based off of
// dexterity... If a player has too many items and tries to pick up another
// one then show a tooltip message and chat message."
//
// The max-weight/overweight-movement-slowdown half of item 29 is a purely
// CLIENT-side effect (WorldScene's own effectiveMoveCooldownMs duplicate —
// see shared/inventory.ts's own doc comment on OVERWEIGHT_MOVE_COOLDOWN_FACTOR)
// with no server-enforced consequence to observe over a socket, same as
// every other movement-speed modifier in this project (dexterity, wisp,
// boots of quickness, ...) — none of those are socket-tested either. This
// script instead verifies the one thing that IS server-authoritative and
// testable: the item-count cap actually blocking a pickup/purchase once
// full, returning the `full: true` ack flag the client uses to show both a
// toast and a chat-log line (see log.ts's own logAckMessage).
//
// One continuous connection per character throughout (see
// verify-crafting-system.mjs's own note on why reconnecting mid-test with
// the same username is avoided).
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
async function makeCharacter(prefix, row, col, extraInventory, dexterity, strength, level) {
  const CHAR = prefix + randomLetters(8);
  const UNAME = (prefix + randomLetters(8)).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  const extraJson = JSON.stringify(extraInventory).replace(/'/g, "''");
  psql(
    `UPDATE players SET map='Bramwick General Shop', "row"=${row}, col=${col}, gold=1000, dexterity=${dexterity}, strength=${strength}, level=${level}, inventory = '${extraJson}'::jsonb WHERE username='${CHAR}';`
  );
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  return { CHAR, UNAME, charToken };
}
function cleanup({ CHAR, UNAME }) {
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// maxInventoryItemCount(dexterity=10, level=1) = 20 + floor(10*0.5) + floor(1*0.5) = 20 + 5 + 0 = 25.
// Seeded 2 short of that (not 1): every login backfills a starting canteen
// onto any account that doesn't have one yet (game.gateway.ts's own
// handleConnection), which would otherwise silently eat the "one item
// short" headroom this test depends on.
const MAX_ITEMS = 25;
const filler = Array.from({ length: MAX_ITEMS - 2 }, () => 'a cup of water');

// Character A: one item short of the cap, sitting within shop reach of
// Bramwick General Shop's own vendor (2,5) — buying tops it up to exactly
// the cap (allowed), then one more purchase should be rejected.
const a = await makeCharacter('InvA', 3, 6, filler, 10, 10, 1);
const { socket: aSocket } = await connect(a.charToken);

let latestChestId = null;
aSocket.on('map:state', (state) => {
  const chest = state.droppedChests?.find((c) => c.row === 3 && c.col === 7);
  if (chest) latestChestId = chest.id;
});

const buyToCapAck = await emit(aSocket, 'buyItem', { vendorId: 'bramwick-general-shop', itemLabel: 'salmon' });
check('buying up to exactly the cap succeeds', buyToCapAck.ok === true, JSON.stringify(buyToCapAck));
check('inventory is now exactly at the cap', buyToCapAck.inventory?.length === MAX_ITEMS, `got ${buyToCapAck.inventory?.length}, expected ${MAX_ITEMS}`);

const buyOverCapAck = await emit(aSocket, 'buyItem', { vendorId: 'bramwick-general-shop', itemLabel: 'salmon' });
check('buying one more once already at the cap is rejected', buyOverCapAck.ok === false, JSON.stringify(buyOverCapAck));
check('the rejection carries the `full` flag the client toasts on', buyOverCapAck.full === true, JSON.stringify(buyOverCapAck));
check('the rejection message mentions the inventory being full', /full/i.test(buyOverCapAck.message ?? ''), buyOverCapAck.message);

// Character B: a second connection, adjacent to A, whose only job is to
// drop one item on the ground so there's something for A (still sitting at
// exactly the cap) to try — and fail — to loot.
const b = await makeCharacter('InvB', 3, 7, ['a cup of water'], 10, 10, 1);
const { socket: bSocket } = await connect(b.charToken);
const dropAck = await emit(bSocket, 'dropItem', 0);
check('the helper character drops its item onto the ground', dropAck.ok === true, JSON.stringify(dropAck));

// Give the map:state broadcast a moment to reach A's own listener above.
await new Promise((r) => setTimeout(r, 400));
check('character A observed the dropped chest appear via map:state', latestChestId !== null, 'no chest id captured');

if (latestChestId) {
  const lootAtCapAck = await emit(aSocket, 'lootDroppedChestItem', { chestId: latestChestId, itemIndex: 0 });
  check('looting a single item while already at the cap is rejected', lootAtCapAck.ok === false && lootAtCapAck.full === true, JSON.stringify(lootAtCapAck));
}

aSocket.close();
bSocket.close();
cleanup(a);
cleanup(b);

process.exit(failures > 0 ? 1 : 0);
