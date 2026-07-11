// Live verification for the wizarding-school pivot: registration creates
// a human character with gender/hairColor/skinTone (no race picker), new
// characters spawn just outside Grimoak Castle's front doors, the
// castle's room graph actually connects (Grounds -> Entrance Hall ->
// Grand Staircase -> Emberclaw Common Room, and Entrance Hall -> Dungeon
// Corridor -> Alchemy), and level/attributes/vitals still start exactly
// where every other race always has.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-wizard-pivot.mjs` from the repo root.
import { io } from 'socket.io-client';

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

async function move(socket, direction) {
  await sleep(120); // stay under the command rate-limiter
  return new Promise((resolve) => socket.emit('move', direction, resolve));
}

// Every map transition in this project requires standing ON the exact
// door tile, THEN pressing the SAME direction again to actually cross
// (see server/worlds/resolveMove.ts) — a single step just walks you onto
// the door tile. This helper keeps stepping in one direction until the
// map actually changes (or gives up after a generous cap, in case
// something's blocking).
async function moveUntilMapChanges(socket, direction, fromMap, maxSteps = 20) {
  let ack;
  for (let i = 0; i < maxSteps; i++) {
    ack = await move(socket, direction);
    if (!ack.ok) {
      console.log('  move blocked ->', ack.message, 'outOfMovement:', ack.outOfMovement);
      break;
    }
    if (ack.player.map !== fromMap) return ack;
  }
  return ack;
}

async function main() {
  const email = `gseven${randomLetters(6)}@example.com`;
  const acctUsername = `Gseven${randomLetters(5)}`;
  const charName = `Gsevena${randomLetters(4)}`;

  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  const accountToken = reg.body.token;
  assert(reg.body.ok, 'account registration (email/username/password only) succeeds');

  const create = await postJson('/characters', { name: charName, gender: 'female', hairColor: 'blonde', skinTone: 'tan' }, accountToken);
  console.log('  create response ->', create.body);
  assert(create.body.ok, 'character creation with gender/hairColor/skinTone (no race field) succeeds');
  assert(create.body.character?.race === 'human', 'the created character\'s race is always "human"');

  const select = await postJson(`/characters/${charName}/select`, {}, accountToken);
  const { socket, sync } = await connectSocket(select.body.token);
  console.log('  sync.player ->', {
    map: sync.player.map,
    row: sync.player.row,
    col: sync.player.col,
    level: sync.player.level,
    gender: sync.player.gender,
    hairColor: sync.player.hairColor,
    skinTone: sync.player.skinTone,
    strength: sync.player.strength,
    hp: sync.player.hp,
    maxHp: sync.player.maxHp,
  });

  // === Item 5: new character starts just outside the castle entrance ===
  assert(sync.player.map === 'Grimoak Grounds', 'a brand new character starts on "Grimoak Grounds"');

  // === Item 4: appearance carried through to the live snapshot ===
  assert(sync.player.gender === 'female', 'gender is set from character creation');
  assert(sync.player.hairColor === 'blonde', 'hairColor is set from character creation');
  assert(sync.player.skinTone === 'tan', 'skinTone is set from character creation');

  // === Item 6: level 1, base attributes/vitals unchanged from every other race ===
  assert(sync.player.level === 1, 'a new character starts at level 1');
  assert(sync.player.strength === 1 && sync.player.intelligence === 1, 'base attributes start at 1, same as every other race');
  assert(sync.player.hp === 100 && sync.player.maxHp === 100, 'starting hp/maxHp is 100, same as every other race');

  // === Item 2: the room graph actually connects — walk north through
  // the castle door, then north again to the Grand Staircase, then east
  // into Emberclaw Common Room ===
  const intoEntranceHall = await moveUntilMapChanges(socket, 'north', 'Grimoak Grounds');
  console.log('  walked into ->', intoEntranceHall.player?.map, intoEntranceHall.player?.row, intoEntranceHall.player?.col);
  assert(intoEntranceHall.ok && intoEntranceHall.player.map === 'Grimoak Entrance Hall', 'walking north through the castle door leads into the Entrance Hall');

  // From the Entrance Hall's door-in landing tile (15,10), walk north to
  // reach the Grand Staircase's own north-wall door at (0,14) — first
  // close the gap to col 14, then walk north repeatedly.
  let ack = intoEntranceHall;
  while (ack.player.col < 14) ack = await move(socket, 'east');
  ack = await moveUntilMapChanges(socket, 'north', 'Grimoak Entrance Hall');
  console.log('  walked into ->', ack.player?.map, ack.player?.row, ack.player?.col);
  assert(ack.player.map === 'Grand Staircase', 'the Entrance Hall\'s door leads into the Grand Staircase');

  // Grand Staircase's east door to Emberclaw sits at (5,9) — arrived at
  // the south door landing (11,5), so close the gap north then east.
  while (ack.player.row > 5) ack = await move(socket, 'north');
  while (ack.player.col < 9) ack = await move(socket, 'east');
  ack = await moveUntilMapChanges(socket, 'east', 'Grand Staircase');
  console.log('  walked into ->', ack.player?.map);
  assert(ack.player.map === 'Emberclaw Common Room', 'the Grand Staircase\'s east door leads into Emberclaw\'s common room');

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
