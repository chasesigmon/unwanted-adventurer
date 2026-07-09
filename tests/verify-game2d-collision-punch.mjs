// Live socket-driven verification for game2d's collision + punch features:
// the training-dummy NPC appears via map:state, players/NPCs block
// movement onto their tile, and a punch is broadcast to everyone sharing
// the map.
//
// Requires `npm run dev` running inside game2d/ (backend on :3001) and
// the game2d-postgres/redis containers up. Run with
// `node tests/verify-game2d-collision-punch.mjs` from the repo root.
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

function waitForMapState(socket) {
  return new Promise((resolve, reject) => {
    socket.once('map:state', (state) => resolve(state));
    setTimeout(() => reject(new Error('map:state timeout')), 5000);
  });
}

// A socket receives its OWN connection's map:state broadcast too (it's
// sent to the whole room, including the joiner) — waiting for a single
// event can race and catch that one instead of a later one triggered by
// someone else joining/moving. Wait for the first state matching a
// predicate instead.
function waitForMapStateMatching(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('map:state', handler);
      reject(new Error('map:state (matching) timeout'));
    }, 5000);
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

function move(socket, direction) {
  return new Promise((resolve, reject) => {
    socket.emit('move', direction, (ack) => (ack ? resolve(ack) : reject(new Error('no ack'))));
  });
}

function waitForPunch(socket) {
  return new Promise((resolve, reject) => {
    socket.once('punch', (payload) => resolve(payload));
    setTimeout(() => reject(new Error('punch timeout')), 5000);
  });
}

function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  // === Test 1: the training-dummy NPC shows up in Great Plains' map:state ===
  {
    const username = `GtwoNpcA${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket, sync } = await connectSocket(token);
    assert(sync.player.map === 'Great Plains', 'new player starts in Great Plains');

    const state = await waitForMapState(socket);
    const dummy = state.npcs.find((n) => n.id === 'training-dummy');
    console.log('map:state npcs ->', state.npcs);
    assert(!!dummy, 'the training-dummy NPC is present in Great Plains map:state');
    assert(dummy?.race === 'skeleton' && dummy?.row === 10 && dummy?.col === 19, 'training dummy is a skeleton at (10, 19)');

    socket.close();
  }

  // === Test 2: a player cannot walk onto the NPC's tile ===
  {
    const username = `GtwoNpcB${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);

    // One tile west of the dummy (10, 19) -> (10, 18); moving east should
    // be blocked by the NPC occupying (10, 19).
    teleport(username, 'Great Plains', 10, 18);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.row === 10 && sync.player.col === 18, 'teleported next to the training dummy');

    const blocked = await move(socket2, 'east');
    assert(!blocked.ok, "walking onto the NPC's tile is rejected");
    assert(blocked.player.row === 10 && blocked.player.col === 18, 'position unchanged after the blocked move');

    socket2.close();
  }

  // === Test 3: two players can't occupy the same tile, and each sees the
  // other via map:state ===
  {
    const usernameA = `GtwoPvpA${randomLetters(5)}`;
    const usernameB = `GtwoPvpB${randomLetters(5)}`;
    const tokenA = await registerOnly('goblin', usernameA);
    const tokenB = await registerOnly('skeleton', usernameB);

    const { socket: closeA } = await connectSocket(tokenA);
    closeA.close();
    const { socket: closeB } = await connectSocket(tokenB);
    closeB.close();
    await sleep(300);

    teleport(usernameA, 'Great Plains', 5, 5);
    teleport(usernameB, 'Great Plains', 5, 6);

    const { socket: socketA, sync: syncA } = await connectSocket(tokenA);
    assert(syncA.player.row === 5 && syncA.player.col === 5, 'player A teleported to (5, 5)');

    const mapStatePromise = waitForMapStateMatching(socketA, (state) => state.players.some((p) => p.username === usernameB));
    const { socket: socketB } = await connectSocket(tokenB);
    const stateSeenByA = await mapStatePromise;
    const bInA = stateSeenByA.players.find((p) => p.username === usernameB);
    assert(!!bInA && bInA.row === 5 && bInA.col === 6, 'player A sees player B via map:state');

    const blockedMove = await move(socketA, 'east');
    assert(!blockedMove.ok, "player A cannot walk onto player B's tile");
    assert(blockedMove.player.row === 5 && blockedMove.player.col === 5, 'player A stayed put');

    // === Test 4: punching player B is broadcast to the map (seen by A) ===
    const punchPromise = waitForPunch(socketA);
    socketB.emit('punch', 'west');
    const punchPayload = await punchPromise;
    assert(punchPayload.username === usernameB && punchPayload.direction === 'west', "player A receives player B's punch broadcast");

    socketA.close();
    socketB.close();
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
