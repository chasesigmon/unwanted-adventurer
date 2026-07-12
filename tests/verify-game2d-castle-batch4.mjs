// Live verification for this batch: 4 fireplaces per room (2 top, 2
// bottom), the halved castle footprint, gradual (not hard-cutoff) castle
// light falloff, and the 10 new 1/3-size classrooms hung off the
// corridors' north walls.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch4.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap, isCastleExteriorBlocked, CASTLE_DOOR_ON_GROUNDS } from '../game2d/dist/shared/maps.js';
import { staticLightRadiusAt, CASTLE_LIGHT_RADIUS_TILES, CASTLE_LIGHT_FALLOFF_TILES } from '../game2d/dist/shared/lighting.js';
import { fireplacePositionsFor } from '../game2d/dist/shared/lighting.js';
import { CLASSROOM_MAPS } from '../game2d/dist/shared/constants.js';

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
  // === 4 fireplaces per room, 2 top + 2 bottom ===
  const entranceFireplaces = fireplacePositionsFor('Grimoak Entrance Hall');
  console.log('  Entrance Hall fireplaces ->', entranceFireplaces);
  assert(entranceFireplaces.length === 4, 'Entrance Hall now has 4 fireplace positions');
  const topCount = entranceFireplaces.filter((p) => p.row < 10).length;
  const bottomCount = entranceFireplaces.filter((p) => p.row > 30).length;
  assert(topCount === 2, '2 fireplaces are near the top of the room');
  assert(bottomCount === 2, '2 fireplaces are near the bottom of the room');

  // === Castle footprint halved again ===
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row, CASTLE_DOOR_ON_GROUNDS.col), 'door tile not blocked');
  assert(isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row - 5, CASTLE_DOOR_ON_GROUNDS.col), 'tile just north of door still blocked');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row - 25, CASTLE_DOOR_ON_GROUNDS.col), 'tile beyond the new (halved) footprint is not blocked');

  // === Gradual light falloff ===
  const atCore = staticLightRadiusAt('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row, CASTLE_DOOR_ON_GROUNDS.col);
  const midFalloffRow = CASTLE_DOOR_ON_GROUNDS.row + CASTLE_LIGHT_RADIUS_TILES + Math.round(CASTLE_LIGHT_FALLOFF_TILES / 2);
  const atMidFalloff = staticLightRadiusAt('Grimoak Grounds', midFalloffRow, CASTLE_DOOR_ON_GROUNDS.col);
  const justOutside = staticLightRadiusAt('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row + CASTLE_LIGHT_RADIUS_TILES + CASTLE_LIGHT_FALLOFF_TILES + 5, CASTLE_DOOR_ON_GROUNDS.col);
  console.log('  radius at core/mid-falloff/beyond ->', atCore, atMidFalloff, justOutside);
  assert(atCore === CASTLE_LIGHT_RADIUS_TILES, 'core radius is the full castle light radius');
  assert(atMidFalloff !== null && atMidFalloff > 0 && atMidFalloff < atCore, 'mid-falloff distance gives a smaller, non-zero radius (a fade, not a cliff)');
  assert(justOutside === null, 'well beyond the falloff distance there is no light at all');

  // === 10 new classrooms exist, are 1/3 size, and connect both ways ===
  assert(CLASSROOM_MAPS.length === 13, 'CLASSROOM_MAPS lists all 13 classroom-sized rooms');
  const potions = getMap('Potions Annex');
  console.log('  Potions Annex size ->', potions.rows, 'x', potions.cols);
  const alchemy = getMap('Alchemy');
  assert(potions.rows === alchemy.rows && potions.cols === alchemy.cols, 'new classrooms match the (now 1/3-size) existing classroom footprint');
  assert(potions.rows < 20 && potions.cols < 25, 'classrooms are meaningfully smaller than the old 40x56 standard room');

  const dungeonCorridor = getMap('Dungeon Corridor');
  const toPotions = dungeonCorridor.exits.find((e) => e.toMap === 'Potions Annex');
  assert(!!toPotions, 'Dungeon Corridor has a door to Potions Annex');
  const backFromPotions = potions.exits.find((e) => e.toMap === 'Dungeon Corridor');
  assert(!!backFromPotions && backFromPotions.toRow === toPotions.row && backFromPotions.toCol === toPotions.col, 'Potions Annex reverses back to the exact door tile');

  // === Live: walk into one of the new classrooms and confirm the map name ===
  const email = `gquad${randomLetters(6)}@example.com`;
  const acctUsername = `Gquad${randomLetters(5)}`;
  const charName = `Gquada${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'blonde', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);

  sql(`UPDATE players SET map='Dungeon Corridor', "row"=${toPotions.row + 1}, col=${toPotions.col} WHERE username='${charName}';`);
  await sleep(200);
  const { socket } = await connectSocket(select.body.token);
  const ack = await moveUntilMapChanges(socket, 'north', 'Dungeon Corridor');
  console.log('  walked through the new door into ->', ack.player?.map);
  assert(ack.ok && ack.player.map === 'Potions Annex', 'walking through the new Dungeon Corridor door arrives at Potions Annex');

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
