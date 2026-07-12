// Live verification for this batch: fireplace top-tile collision, the
// re-centered + collidable Utilization podium, the lucem book's "more
// hours" cooldown message, the new luck stat, and the shrunk Grimoak
// Grounds' moat + bridge collision/spawn point.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch6.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import {
  CASTLE_DOOR_ON_GROUNDS,
  GRIMOAK_GROUNDS_SPAWN,
  isMoatBlocked,
  isBridgeTile,
  isCastleExteriorBlocked,
  MOAT_OUTER_BOTTOM,
} from '../game2d/dist/shared/maps.js';
import { fireplacePositionsFor, isFireplaceBlocked } from '../game2d/dist/shared/lighting.js';
import { LUCEM_BOOK_POSITION } from '../game2d/dist/shared/spells.js';

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

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

async function main() {
  // === Fireplace top-tile collision ===
  const fp = fireplacePositionsFor('Grimoak Entrance Hall')[0];
  assert(isFireplaceBlocked('Grimoak Entrance Hall', fp.row, fp.col), 'the fireplace tile itself is blocked');
  assert(isFireplaceBlocked('Grimoak Entrance Hall', fp.row - 1, fp.col), 'the tile directly above the fireplace is also blocked now');
  assert(!isFireplaceBlocked('Grimoak Entrance Hall', fp.row - 2, fp.col), 'two tiles above the fireplace is not blocked');

  // === Podium re-centered + collidable ===
  const utilization = getMap('Utilization');
  const utilizationMidCol = Math.floor(utilization.cols / 2);
  assert(LUCEM_BOOK_POSITION.col === utilizationMidCol, 'the podium is centered on the room (matches CLASSROOM_MID_COL)');
  console.log('  podium position ->', LUCEM_BOOK_POSITION);

  // === Moat/bridge/spawn ===
  console.log('  new spawn ->', GRIMOAK_GROUNDS_SPAWN, 'door ->', CASTLE_DOOR_ON_GROUNDS);
  assert(!isMoatBlocked('Grimoak Grounds', GRIMOAK_GROUNDS_SPAWN.row, GRIMOAK_GROUNDS_SPAWN.col), 'the new spawn point itself is not moat-blocked');
  assert(isBridgeTile('Grimoak Grounds', MOAT_OUTER_BOTTOM, CASTLE_DOOR_ON_GROUNDS.col), 'the tile directly north of spawn is the bridge');
  assert(!isMoatBlocked('Grimoak Grounds', MOAT_OUTER_BOTTOM, CASTLE_DOOR_ON_GROUNDS.col), 'the bridge tile is walkable');
  assert(isMoatBlocked('Grimoak Grounds', MOAT_OUTER_BOTTOM, CASTLE_DOOR_ON_GROUNDS.col - 10), 'off to the side of the bridge, the moat blocks movement');
  assert(!isCastleExteriorBlocked('Grimoak Grounds', CASTLE_DOOR_ON_GROUNDS.row, CASTLE_DOOR_ON_GROUNDS.col), 'the door tile itself is still walkable');

  // === Live account/character/socket flow ===
  const email = `ghex${randomLetters(6)}@example.com`;
  const acctUsername = `Ghex${randomLetters(5)}`;
  const charName = `Ghexa${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'dark' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);

  console.log('  spawn position from sync ->', sync.player.row, sync.player.col, sync.player.map);
  assert(sync.player.row === GRIMOAK_GROUNDS_SPAWN.row && sync.player.col === GRIMOAK_GROUNDS_SPAWN.col, 'a new character spawns at the new, moat-outside spawn point');

  // === Luck stat ===
  console.log('  luck ->', sync.player.luck);
  assert(sync.player.luck === 1, 'a new character starts with luck 1');

  // === Moat actually blocks a real move attempt off to the side ===
  sql(`UPDATE players SET "row"=${MOAT_OUTER_BOTTOM}, col=${CASTLE_DOOR_ON_GROUNDS.col - 10 + 1} WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s2 } = await connectSocket(select.body.token);
  const moatBlockAck = await move(s2, 'west');
  console.log('  move into moat off to the side ->', moatBlockAck.ok, moatBlockAck.message);
  assert(!moatBlockAck.ok, 'walking into the moat off to the side of the bridge is blocked');
  s2.close();

  // === Lucem book message wording ===
  sql(`UPDATE players SET map='Utilization', "row"=${LUCEM_BOOK_POSITION.row - 1}, col=${LUCEM_BOOK_POSITION.col} WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3 } = await connectSocket(select.body.token);
  const firstRead = await emitWithAck(s3, 'readLucemBook');
  console.log('  first book read ->', firstRead);
  assert(firstRead.ok, 'reading the book from directly in front of it succeeds');
  const secondRead = await emitWithAck(s3, 'readLucemBook');
  console.log('  immediate second read ->', secondRead);
  assert(!secondRead.ok, 'reading again immediately is on cooldown');
  assert(/more hours?\)/.test(secondRead.message ?? ''), 'the cooldown message says "(# more hour(s))" now, not "world tick(s)"');
  assert(!/world tick/.test(secondRead.message ?? ''), 'the old "world tick" wording is gone from this message');
  s3.close();

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
