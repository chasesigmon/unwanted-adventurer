// Live verification for this batch: castle-exterior collision on the
// Grounds, fireplace collision inside a castle room, and the new stairs
// connection from the Grand Staircase up to the (stub) Second Floor
// Corridor.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch2.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap, isCastleExteriorBlocked } from '../game2d/dist/shared/maps.js';
import { fireplacePositionsFor } from '../game2d/dist/shared/lighting.js';

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
  // === Static checks against the shared map data itself ===
  const secondFloor = getMap('Second Floor Corridor');
  console.log('  Second Floor Corridor size ->', secondFloor.rows, 'x', secondFloor.cols);
  assert(secondFloor.rows > 0 && secondFloor.cols > 0, 'Second Floor Corridor exists as a real map');

  assert(isCastleExteriorBlocked('Grimoak Grounds', 100, 90), 'a tile well inside the castle footprint is blocked');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', 130, 90), 'the door tile itself is NOT blocked');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', 131, 90), 'the spawn tile (south of the door) is NOT blocked');

  const entranceFireplaces = fireplacePositionsFor('Grimoak Entrance Hall');
  console.log('  Entrance Hall fireplaces ->', entranceFireplaces);
  assert(entranceFireplaces.length === 2, 'Entrance Hall has exactly 2 fireplace positions');

  // === Live account/character/socket flow ===
  const email = `gnine${randomLetters(6)}@example.com`;
  const acctUsername = `Gnine${randomLetters(5)}`;
  const charName = `Gninea${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  const create = await postJson('/characters', { name: charName, gender: 'male', hairColor: 'brown', skinTone: 'tan' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);

  console.log('  spawn position ->', sync.player.row, sync.player.col);
  assert(sync.player.row === 131 && sync.player.col === 90, 'new character spawns exactly at the expected Grounds spawn point');

  // === Castle exterior collision: teleport directly onto a blocked tile
  // and confirm a plain sync doesn't move them (collision only applies to
  // MOVEMENT, so instead verify a move INTO the footprint from just
  // outside it is rejected) ===
  sql(`UPDATE players SET "row"=100, col=91 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s2 } = await connectSocket(select.body.token);
  const blockedAck = await move(s2, 'west'); // steps to (100,90), inside the footprint
  console.log('  move into castle footprint ->', blockedAck.ok, blockedAck.message);
  assert(!blockedAck.ok, 'walking into the castle exterior footprint is blocked');
  s2.close();

  // === Fireplace collision inside the Entrance Hall ===
  const fp = entranceFireplaces[0];
  sql(`UPDATE players SET map='Grimoak Entrance Hall', "row"=${fp.row}, col=${fp.col - 1} WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3 } = await connectSocket(select.body.token);
  const fireplaceAck = await move(s3, 'east');
  console.log('  move onto fireplace tile ->', fireplaceAck.ok, fireplaceAck.message);
  assert(!fireplaceAck.ok, 'walking onto a fireplace tile is blocked');
  s3.close();

  // === Stairs: Grand Staircase -> Second Floor Corridor ===
  sql(`UPDATE players SET map='Grand Staircase', "row"=36, col=59 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s4 } = await connectSocket(select.body.token);
  const stairsAck = await moveUntilMapChanges(s4, 'east', 'Grand Staircase');
  console.log('  walked up the stairs into ->', stairsAck.player?.map);
  assert(stairsAck.ok && stairsAck.player.map === 'Second Floor Corridor', 'the Grand Staircase\'s stairs lead up to the Second Floor Corridor');
  s4.close();

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
