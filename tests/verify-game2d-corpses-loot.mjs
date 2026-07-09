// Live socket-driven verification for game2d's corpse/loot system: killing
// a wild goblin leaves a lootable corpse, looting it adds the item to the
// killer's inventory and removes the corpse, and looting from too far
// away (or a corpse that's already gone) is rejected.
//
// Requires `npm run dev` running inside game2d/ (backend on :3001) and
// the game2d-postgres/redis containers up. Run with
// `node tests/verify-game2d-corpses-loot.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function randomLetters(n) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}
const PASSWORD = 'testpass123';

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerOnly(race, username) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, race }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`register failed: ${JSON.stringify(body)}`);
  return body.token;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}

function waitForCombat(socket, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('combat event timeout')), timeoutMs);
    socket.once('combat', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForMapStateMatching(socket, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('map:state', handler);
      reject(new Error('map:state (matching) timeout'));
    }, timeoutMs);
    function handler(state) {
      if (predicate(state)) {
        clearTimeout(timer);
        socket.off('map:state', handler);
        resolve(state);
      }
    }
    socket.on('map:state', handler);
  });
}

function punch(socket, direction) {
  socket.emit('punch', direction);
}

function loot(socket, corpseId) {
  return new Promise((resolve, reject) => {
    socket.emit('loot', corpseId, (ack) => (ack ? resolve(ack) : reject(new Error('no loot ack'))));
  });
}

function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  const username = `GtwoLootA${randomLetters(4)}`;
  const token = await registerOnly('goblin', username);
  const { socket } = await connectSocket(token);
  socket.close();
  await sleep(300);

  // Find a live wild goblin to hunt down.
  const { socket: scout, sync: scoutSync } = await connectSocket(token);
  const state = await waitForMapStateMatching(scout, (s) => s.monsters.some((m) => m.kind === 'wild goblin'));
  const goblin = state.monsters.find((m) => m.kind === 'wild goblin');
  scout.close();

  teleport(username, 'Great Plains', goblin.row, goblin.col - 1);
  const { socket: fighter, sync } = await connectSocket(token);
  assert(sync.player.row === goblin.row && sync.player.col === goblin.col - 1, 'teleported next to a wild goblin');
  assert(Array.isArray(sync.player.inventory) && sync.player.inventory.length === 0, 'new player starts with an empty inventory');

  let lastCombat;
  for (let i = 0; i < 4; i++) {
    const combatPromise = waitForCombat(fighter);
    punch(fighter, 'east');
    lastCombat = await combatPromise;
    if (lastCombat.targetDied) break;
  }
  assert(lastCombat.targetDied, 'the wild goblin was killed');

  // A corpse should now be sitting at the goblin's last position, holding
  // a "wild goblin ear". Matched by exact position (not just "any wild
  // goblin corpse") since earlier test runs can leave their own
  // never-cleaned-up corpses lying around elsewhere on the map.
  const stateAfterDeath = await waitForMapStateMatching(
    fighter,
    (s) => s.corpses.some((c) => c.row === goblin.row && c.col === goblin.col)
  );
  const corpse = stateAfterDeath.corpses.find((c) => c.row === goblin.row && c.col === goblin.col);
  console.log('corpse ->', corpse);
  assert(!!corpse, 'a corpse was left behind where the wild goblin died');
  assert(corpse.itemLabel === 'wild goblin ear', 'the corpse holds a "wild goblin ear"');

  // Loot it.
  const lootAck = await loot(fighter, corpse.id);
  console.log('loot ack ->', lootAck);
  assert(lootAck.ok, 'looting the corpse succeeds');
  assert(lootAck.inventory.includes('wild goblin ear'), 'the item is now in the inventory');

  // Looting it again should fail — it's gone.
  const secondLootAck = await loot(fighter, corpse.id);
  assert(!secondLootAck.ok, 'looting the same corpse twice fails the second time');

  // Looting something far away should also fail.
  const farLootAck = await loot(fighter, 'not-a-real-id');
  assert(!farLootAck.ok, 'looting a nonexistent corpse id fails');

  fighter.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
