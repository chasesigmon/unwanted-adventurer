// Live verification for this batch: no movement/MV stat anywhere in the
// live payloads, a new human character starts with zero skills, and the
// castle rooms are actually the new much-larger "fullscreen" dimensions
// (checked directly against shared/maps.ts, the same source of truth the
// client/server both read).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-changes.mjs` from the repo root.
import { io } from 'socket.io-client';
// Imports the BUILT output (dist/shared, from `npm run build:server`
// inside game2d/) rather than the .ts source — plain node can't load
// TypeScript directly.
import { getMap } from '../game2d/dist/shared/maps.js';

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

async function postJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}

async function main() {
  // === Room dimensions (item 5) — comfortably larger than any real
  // viewport at 32px/tile ===
  const grounds = getMap('Grimoak Grounds');
  const entranceHall = getMap('Grimoak Entrance Hall');
  const greatHall = getMap('Great Hall');
  const dungeonCorridor = getMap('Dungeon Corridor');
  const elementalCasting = getMap('Elemental Casting');
  console.log('  Entrance Hall size ->', entranceHall.rows, 'x', entranceHall.cols, `(${entranceHall.cols * 32}x${entranceHall.rows * 32}px)`);
  assert(entranceHall.cols * 32 >= 1400 && entranceHall.rows * 32 >= 1000, 'Entrance Hall is large enough to fill a typical viewport');
  assert(greatHall.cols * 32 >= 1400 && greatHall.rows * 32 >= 1000, 'Great Hall is large enough to fill a typical viewport');
  assert(dungeonCorridor.cols * 32 >= 1400 && dungeonCorridor.rows * 32 >= 1000, 'Dungeon Corridor is large enough to fill a typical viewport');
  assert(elementalCasting.cols * 32 >= 1400 && elementalCasting.rows * 32 >= 1000, 'Elemental Casting is large enough to fill a typical viewport');
  assert(grounds.rows === 80 && grounds.cols === 80, 'Grimoak Grounds itself stayed at its original 80x80 (outer world, not a "room")');

  // === Account/character flow + no movement stat + zero starting skills ===
  const email = `geight${randomLetters(6)}@example.com`;
  const acctUsername = `Geight${randomLetters(5)}`;
  const charName = `Geighta${randomLetters(4)}`;

  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  const accountToken = reg.body.token;
  const create = await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'white' }, accountToken);
  assert(create.body.ok, 'character creation still works with the new fields');

  const select = await postJson(`/characters/${charName}/select`, {}, accountToken);
  const { socket, sync } = await connectSocket(select.body.token);

  console.log('  sync.player keys ->', Object.keys(sync.player).sort().join(', '));
  assert(sync.player.movement === undefined, 'movement is not present in the live player snapshot');
  assert(sync.player.maxMovement === undefined, 'maxMovement is not present in the live player snapshot');
  assert(Object.keys(sync.player.skills).length === 0, 'a brand new human character starts with zero skills');

  // A plain move still works fine with no movement-cost gating at all.
  const moveAck = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  console.log('  move ack ->', moveAck.ok, moveAck.player?.row, moveAck.player?.col, 'outOfMovement' in moveAck);
  assert(moveAck.ok, 'moving still works with movement removed entirely');
  assert(!('outOfMovement' in moveAck), 'the move ack no longer carries an outOfMovement flag at all');

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
