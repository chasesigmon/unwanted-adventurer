// Live socket-driven verification for game2d's new backend: register/
// login (goblin or skeleton), sync, movement, and the Great Plains <->
// Labyrinth door transitions (walk north from Great Plains' top-middle
// tile, land at Labyrinth's south-middle; walk south from there, land
// back at Great Plains' top-middle).
//
// Requires `npm run dev` running inside game2d/ (backend on :3001) and
// the game2d-postgres/redis containers (docker compose up -d
// game2d-postgres redis, from the repo root). Run with
// `node tests/verify-game2d-worlds.mjs` from the repo root.
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

async function loginOnly(username) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`login failed: ${JSON.stringify(body)}`);
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

function move(socket, direction) {
  return new Promise((resolve, reject) => {
    socket.emit('move', direction, (ack) => (ack ? resolve(ack) : reject(new Error('no ack'))));
  });
}

function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  // === Test 1: register as goblin, sync reflects race/starting map ===
  {
    const username = `GtwoGob${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket, sync } = await connectSocket(token);
    console.log('sync ->', sync);
    assert(sync.player.race === 'goblin', 'registered goblin syncs with race "goblin"');
    assert(sync.player.map === 'Great Plains', 'new player starts in Great Plains');
    assert(typeof sync.player.row === 'number' && typeof sync.player.col === 'number', 'sync includes row/col');

    socket.close();
  }

  // === Test 2: register as skeleton — race choice actually persists ===
  {
    const username = `GtwoSkel${randomLetters(5)}`;
    const token = await registerOnly('skeleton', username);
    const { socket, sync } = await connectSocket(token);
    assert(sync.player.race === 'skeleton', 'registered skeleton syncs with race "skeleton"');
    socket.close();
    await sleep(300);

    // Re-login (fresh token) and confirm the race/position persisted in Postgres.
    const token2 = await loginOnly(username);
    const { socket: socket2, sync: sync2 } = await connectSocket(token2);
    assert(sync2.player.race === 'skeleton', 'race persisted across a fresh login');
    socket2.close();
  }

  // === Test 3: walking north from Great Plains' door lands at the
  // Labyrinth's south-middle; walking south from there returns to Great
  // Plains' top-middle ===
  {
    const username = `GtwoWalk${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);

    // Teleport directly to the Great Plains door tile (row 0, col 10).
    teleport(username, 'Great Plains', 0, 10);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.map === 'Great Plains' && sync.player.row === 0 && sync.player.col === 10, 'teleported to the Great Plains door tile');

    const ack = await move(socket2, 'north');
    console.log('walk north through the door ->', ack);
    assert(ack.ok, 'walking north through the door succeeded');
    assert(ack.player.map === 'Labyrinth', 'entering the door transitions to the Labyrinth');
    assert(ack.player.row === 19 && ack.player.col === 10, 'arrives at the Labyrinth\'s south-middle tile (19, 10)');

    const ack2 = await move(socket2, 'south');
    console.log('walk south back through the door ->', ack2);
    assert(ack2.ok, 'walking south through the Labyrinth door succeeded');
    assert(ack2.player.map === 'Great Plains', 'the Labyrinth door transitions back to Great Plains');
    assert(ack2.player.row === 0 && ack2.player.col === 10, 'arrives back at Great Plains\' top-middle tile (0, 10)');

    socket2.close();
  }

  // === Test 4: ordinary movement within a map, and rejection at an edge ===
  {
    const username = `GtwoEdge${randomLetters(5)}`;
    const token = await registerOnly('skeleton', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);

    teleport(username, 'Labyrinth', 0, 0);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.row === 0 && sync.player.col === 0, 'teleported to the Labyrinth\'s corner');

    const blocked = await move(socket2, 'north');
    assert(!blocked.ok, 'walking off the map edge (no door here) is rejected');
    assert(blocked.player.row === 0 && blocked.player.col === 0, 'position is unchanged after a rejected move');

    const okMove = await move(socket2, 'east');
    assert(okMove.ok && okMove.player.row === 0 && okMove.player.col === 1, 'an ordinary in-bounds move succeeds and advances one tile');

    socket2.close();
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
