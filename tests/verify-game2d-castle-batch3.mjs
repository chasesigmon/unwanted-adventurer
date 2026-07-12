// Live verification for this batch: castle-exterior widened (not
// stretched) with a matching, smaller collision footprint, a castle
// night-time static light source with a large custom radius, and a
// second staircase in the Grimoak Entrance Hall leading to its own
// distinct tile on the Second Floor Corridor.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch3.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap, isCastleExteriorBlocked, CASTLE_DOOR_ON_GROUNDS } from '../game2d/dist/shared/maps.js';
import { staticLightRadiusAt, isNearStaticLight, CASTLE_LIGHT_RADIUS_TILES } from '../game2d/dist/shared/lighting.js';

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

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
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
  await sleep(120);
  return new Promise((resolve) => socket.emit('move', direction, resolve));
}

async function moveUntilMapChanges(socket, direction, fromMap, maxSteps = 30) {
  let ack;
  for (let i = 0; i < maxSteps; i++) {
    ack = await move(socket, direction);
    if (!ack.ok) {
      console.log('  move blocked ->', ack.message);
      break;
    }
    if (ack.player.map !== fromMap) return ack;
  }
  return ack;
}

async function main() {
  // === Static checks against shared map/lighting data ===
  const entrance = getMap('Grimoak Entrance Hall');
  const newStairsExit = entrance.exits.find((e) => e.kind === 'stairs');
  console.log('  Entrance Hall new stairs exit ->', newStairsExit);
  assert(!!newStairsExit, 'Entrance Hall has a stairs-kind exit');
  assert(newStairsExit.toMap === 'Second Floor Corridor', 'the new Entrance Hall stairs lead to Second Floor Corridor');

  const secondFloor = getMap('Second Floor Corridor');
  assert(secondFloor.exits.length === 2, 'Second Floor Corridor has two distinct down-staircases');
  const backToEntrance = secondFloor.exits.find((e) => e.toMap === 'Grimoak Entrance Hall');
  assert(!!backToEntrance && backToEntrance.toCol === newStairsExit.col && backToEntrance.toRow === newStairsExit.row, 'the Second Floor tile reverses back to the exact Entrance Hall stairs tile');

  // Castle footprint shrunk (item 2 fix) — much smaller than the old
  // uniform-5x-scale footprint, but still blocks a tile right behind the
  // door, and still leaves the door itself + spawn walkable.
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row, CASTLE_DOOR_ON_GROUNDS.col), 'the door tile itself is NOT blocked');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row + 1, CASTLE_DOOR_ON_GROUNDS.col), 'the spawn tile south of the door is NOT blocked');
  assert(isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row - 5, CASTLE_DOOR_ON_GROUNDS.col), 'a tile just north of the door, inside the new footprint, is blocked');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row - 60, CASTLE_DOOR_ON_GROUNDS.col), 'a tile far north of the new (shorter) footprint is NOT blocked');

  // Castle static light source (items 1 & 5) — big radius around the door.
  const nearDoorRadius = staticLightRadiusAt('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row, CASTLE_DOOR_ON_GROUNDS.col);
  console.log('  radius at the door ->', nearDoorRadius);
  assert(nearDoorRadius === CASTLE_LIGHT_RADIUS_TILES, 'the door tile itself resolves to the castle light radius, not the small town-lamp radius');
  assert(isNearStaticLight('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row + CASTLE_LIGHT_RADIUS_TILES, CASTLE_DOOR_ON_GROUNDS.col), 'a tile at the edge of the 30ft castle light radius is still lit');
  assert(!isNearStaticLight('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row + CASTLE_LIGHT_RADIUS_TILES + 20, CASTLE_DOOR_ON_GROUNDS.col), 'a tile well outside the castle light radius is not lit');
  assert(!isNearStaticLight('Grimoak Grounds', 5, 5), 'a corner of the grounds far from the castle is not lit');

  // === Live account/character/socket flow: walk up the NEW stairs ===
  const email = `gten${randomLetters(6)}@example.com`;
  const acctUsername = `Gten${randomLetters(5)}`;
  const charName = `Gtena${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  const create = await postJson('/characters', { name: charName, gender: 'female', hairColor: 'black', skinTone: 'dark' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  assert(select.status === 201 || select.status === 200, 'character select succeeded');

  sql(`UPDATE players SET map='Grimoak Entrance Hall', "row"=${newStairsExit.row - 1}, col=${newStairsExit.col} WHERE username='${charName}';`);
  await sleep(200);
  const { socket } = await connectSocket(select.body.token);
  const stairsAck = await moveUntilMapChanges(socket, 'south', 'Grimoak Entrance Hall');
  console.log('  walked up the new entrance-hall stairs into ->', stairsAck.player?.map, stairsAck.player?.row, stairsAck.player?.col);
  assert(stairsAck.ok && stairsAck.player.map === 'Second Floor Corridor', 'the new Entrance Hall stairs lead up to the Second Floor Corridor');
  assert(stairsAck.player.row === newStairsExit.toRow && stairsAck.player.col === newStairsExit.toCol, 'arrives on the expected distinct tile (not the Grand Staircase one)');

  // Walk back down and confirm it returns to the entrance hall stairs tile, not the Grand Staircase.
  const backAck = await moveUntilMapChanges(socket, 'south', 'Second Floor Corridor');
  console.log('  walked back down into ->', backAck.player?.map, backAck.player?.row, backAck.player?.col);
  assert(backAck.ok && backAck.player.map === 'Grimoak Entrance Hall', 'walking back down returns to the Entrance Hall');
  assert(backAck.player.row === newStairsExit.row && backAck.player.col === newStairsExit.col, 'lands exactly back on the Entrance Hall stairs tile');

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
