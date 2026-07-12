// Live verification for this batch: simplified castle map graph (5
// classrooms + rewired house common rooms, all off the Entrance Hall),
// teacher NPC + desk collision, a starting wand + wand equip/sprite
// wiring, the lucem skill/book-podium interaction and its wand-light
// toggle, and the spells data file.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch5.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import { GRIMOAK_CASTLE_MAPS, CLASSROOM_MAPS } from '../game2d/dist/shared/constants.js';
import { SPELLS } from '../game2d/dist/shared/spells.js';
import { WAND_ITEM } from '../game2d/dist/shared/equipment.js';
import { LUCEM_SKILL } from '../game2d/dist/shared/skills.js';

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

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

async function main() {
  // === Static map/data checks ===
  assert(GRIMOAK_CASTLE_MAPS.length === 11, 'GRIMOAK_CASTLE_MAPS has the 11 simplified rooms');
  assert(CLASSROOM_MAPS.length === 5, 'CLASSROOM_MAPS lists exactly the 5 named classrooms');
  for (const removed of ['Grand Staircase', 'Dungeon Corridor', 'First Floor Corridor', 'Second Floor Corridor', 'Alchemy', 'Shapecraft']) {
    assert(!GRIMOAK_CASTLE_MAPS.includes(removed), `${removed} no longer exists in the castle map list`);
  }

  const entrance = getMap('Grimoak Entrance Hall');
  const classroomNames = ['Elemental Casting', 'Defense', 'Summoning', 'Utilization', 'Offense'];
  for (const name of classroomNames) {
    const exit = entrance.exits.find((e) => e.toMap === name);
    assert(!!exit, `Entrance Hall has a direct door to ${name}`);
    const room = getMap(name);
    const back = room.exits.find((e) => e.toMap === 'Grimoak Entrance Hall');
    assert(!!back && back.toRow === exit.row && back.toCol === exit.col, `${name} reverses back to the exact Entrance Hall door tile`);
  }
  for (const name of ['Emberclaw Common Room', 'Starfall Common Room', 'Duskwing Common Room']) {
    const exit = entrance.exits.find((e) => e.toMap === name);
    assert(!!exit, `Entrance Hall has a direct door to ${name} (rewired from the removed hub rooms)`);
  }

  assert(SPELLS.length === 9, 'SPELLS has all 9 named spells');
  assert(SPELLS.some((s) => s.name === 'lucem'), 'lucem is in the spell list');

  // === Live account/character/socket flow ===
  const email = `gpent${randomLetters(6)}@example.com`;
  const acctUsername = `Gpent${randomLetters(5)}`;
  const charName = `Gpenta${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'female', hairColor: 'brown', skinTone: 'tan' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);

  // === Starting wand ===
  const row0 = sql(`SELECT inventory FROM players WHERE username='${charName}';`);
  console.log('  starting inventory row ->', row0);
  assert(row0.includes('wand'), 'new character starts with a wand in inventory');

  // === Teacher + desk collision in the Utilization classroom ===
  // The teacher stands at (2, mid-col), its desk one tile south at
  // (3, mid-col) — see server/worlds/teachers.ts.
  const utilization = getMap('Utilization');
  const teacherCol = Math.floor(utilization.cols / 2);
  sql(`UPDATE players SET map='Utilization', "row"=4, col=${teacherCol} WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3 } = await connectSocket(select.body.token);
  const deskBlockAck = await move(s3, 'north'); // (4,teacherCol) -> (3,teacherCol), the desk tile
  console.log('  move onto desk tile ->', deskBlockAck.ok, deskBlockAck.message);
  assert(!deskBlockAck.ok, 'walking onto the teacher desk tile is blocked');
  s3.close();

  // === Wand equip + lucem book podium reach/cooldown ===
  sql(`UPDATE players SET map='Utilization', "row"=6, col=6 WHERE username='${charName}';`); // adjacent to the book at (6,5)
  await sleep(200);
  const { socket: s4 } = await connectSocket(select.body.token);

  const useAck = await emitWithAck(s4, 'useItem', 0); // equip the wand (inventory index 0)
  console.log('  equip wand ->', useAck);
  assert(useAck.ok && useAck.equipment.weapon === WAND_ITEM, 'equipping inventory slot 0 (the wand) sets equipment.weapon to wand');

  const bookAck = await emitWithAck(s4, 'readLucemBook');
  console.log('  read lucem book ->', bookAck);
  assert(bookAck.ok, 'reading the lucem book from reach succeeds (roll may or may not teach it)');
  assert(typeof bookAck.lucemBookReadyAtTick === 'number', 'reading the book sets a cooldown tick');

  const bookAckAgain = await emitWithAck(s4, 'readLucemBook');
  console.log('  read lucem book again immediately ->', bookAckAgain);
  assert(!bookAckAgain.ok, 'reading again before the cooldown elapses is rejected');

  // Directly grant the skill (bypassing the 10% roll) to verify the /lucem toggle mechanics deterministically.
  sql(`UPDATE players SET skills = skills || '{"lucem": 1}'::jsonb WHERE username='${charName}';`);
  s4.close();
  await sleep(200);
  const { socket: s5, sync: sync5 } = await connectSocket(select.body.token);
  assert(sync5.player.skills.lucem !== undefined, 'lucem skill is present after granting it directly');
  assert(sync5.player.wandLit === false, 'wand starts unlit');

  const syncAfterLucem = new Promise((resolve) => s5.once('sync', resolve));
  s5.emit('chat', '/lucem');
  const { player: playerAfterLucem } = await syncAfterLucem;
  console.log('  wandLit after /lucem toggle ->', playerAfterLucem.wandLit);
  assert(playerAfterLucem.wandLit === true, 'casting /lucem with the skill+wand equipped lights the wand');

  const syncAfterLucemOff = new Promise((resolve) => s5.once('sync', resolve));
  s5.emit('chat', '/lucem');
  const { player: playerAfterLucemOff } = await syncAfterLucemOff;
  console.log('  wandLit after casting /lucem again ->', playerAfterLucemOff.wandLit);
  assert(playerAfterLucemOff.wandLit === false, 'casting /lucem again turns the wand back off');

  s5.close();

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
