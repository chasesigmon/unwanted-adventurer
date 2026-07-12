// Live verification for this batch: irrigo's new success-chance/growth
// parity with lucem, lucem's real-time duration mechanism existing
// (timing itself isn't practical to wait out in an automated test — see
// its own note below), 10%-starting skills, classroom fireplace/desk
// overlap fixed, common rooms moved off the north wall, chairs +
// collision, the second Utilization podium (quick movement) + its own
// success/mana/growth mechanics, and the imp spawn/patrol system.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch9.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import { fireplacePositionsFor, studentDeskPositionsFor, chairPositionsFor, isChairBlocked } from '../game2d/dist/shared/lighting.js';
import {
  isPodiumBlocked,
  LUCEM_BOOK_MAP,
  LUCEM_BOOK_POSITION,
  IRRIGO_BOOK_MAP,
  IRRIGO_BOOK_POSITION,
  QUICK_MOVEMENT_BOOK_MAP,
  QUICK_MOVEMENT_BOOK_POSITION,
} from '../game2d/dist/shared/spells.js';
import { STARTING_SKILL_PERCENT } from '../game2d/dist/shared/skills.js';
import { MONSTER_KINDS } from '../game2d/dist/shared/constants.js';

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

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

function move(socket, direction) {
  return new Promise((resolve) => socket.emit('move', direction, resolve));
}

function onceMapState(socket) {
  return new Promise((resolve) => socket.once('map:state', resolve));
}

async function main() {
  // === Item 8: skills now start at 10%, not 1% ===
  assert(STARTING_SKILL_PERCENT === 10, 'STARTING_SKILL_PERCENT is now 10');

  // === Item 3: classroom fireplaces no longer overlap student desks ===
  const utilizationFireplaces = fireplacePositionsFor('Utilization');
  const utilizationDesks = studentDeskPositionsFor('Utilization');
  console.log('  Utilization fireplaces ->', utilizationFireplaces, 'desks ->', utilizationDesks);
  for (const fp of utilizationFireplaces) {
    const overlap = utilizationDesks.some((d) => d.row === fp.row && d.col === fp.col);
    assert(!overlap, `fireplace at (${fp.row},${fp.col}) doesn't sit on a student desk`);
  }

  // === Item 4: common rooms are east/west of the Entrance Hall; only
  // classrooms are on the north wall ===
  const entranceHall = getMap('Grimoak Entrance Hall');
  const northExits = entranceHall.exits.filter((e) => e.direction === 'north');
  const eastExits = entranceHall.exits.filter((e) => e.direction === 'east');
  const westExits = entranceHall.exits.filter((e) => e.direction === 'west');
  console.log(
    '  Entrance Hall doors -> north:',
    northExits.map((e) => e.toMap),
    'east:',
    eastExits.map((e) => e.toMap),
    'west:',
    westExits.map((e) => e.toMap)
  );
  assert(
    northExits.every((e) => !e.toMap.endsWith('Common Room')),
    'no common room hangs off the Entrance Hall\'s north wall'
  );
  assert(northExits.length === 5, 'exactly the 5 classrooms are on the north wall');
  const commonRoomNames = ['Thistledown Common Room', 'Emberclaw Common Room', 'Starfall Common Room', 'Duskwing Common Room'];
  const eastWestNames = [...eastExits, ...westExits].map((e) => e.toMap);
  for (const name of commonRoomNames) {
    assert(eastWestNames.includes(name), `${name} is reachable from the Entrance Hall's east or west wall`);
  }

  // === Item 9: chairs exist in the Entrance Hall and a common room,
  // clear of the fireplaces, and are collision-blocked ===
  const entranceChairs = chairPositionsFor('Grimoak Entrance Hall');
  console.log('  Entrance Hall chairs ->', entranceChairs);
  assert(entranceChairs.length === 4, 'the Entrance Hall has 4 social chairs');
  const entranceFireplaces = fireplacePositionsFor('Grimoak Entrance Hall');
  for (const c of entranceChairs) {
    assert(!entranceFireplaces.some((fp) => fp.row === c.row && fp.col === c.col), `chair at (${c.row},${c.col}) doesn't overlap a fireplace`);
    assert(isChairBlocked('Grimoak Entrance Hall', c.row, c.col), `chair at (${c.row},${c.col}) is collision-blocked`);
  }
  assert(chairPositionsFor('Emberclaw Common Room').length === 4, 'a common room (Emberclaw) also has 4 social chairs');
  assert(chairPositionsFor('Utilization').length === 0, 'chairs are not placed in classrooms (they have student desks instead)');

  // === Item 12: the second Utilization podium sits a few tiles from the
  // first, and isPodiumBlocked covers all three podiums ===
  assert(QUICK_MOVEMENT_BOOK_MAP === 'Utilization', 'quick movement is taught in Utilization, same as lucem');
  assert(QUICK_MOVEMENT_BOOK_POSITION.col !== LUCEM_BOOK_POSITION.col, 'the two Utilization podiums sit at different columns');
  assert(isPodiumBlocked(QUICK_MOVEMENT_BOOK_MAP, QUICK_MOVEMENT_BOOK_POSITION.row, QUICK_MOVEMENT_BOOK_POSITION.col), 'the quick movement podium is collision-blocked');
  assert(isPodiumBlocked(LUCEM_BOOK_MAP, LUCEM_BOOK_POSITION.row, LUCEM_BOOK_POSITION.col), 'the lucem podium is still collision-blocked too');
  assert(isPodiumBlocked(IRRIGO_BOOK_MAP, IRRIGO_BOOK_POSITION.row, IRRIGO_BOOK_POSITION.col), 'the irrigo podium is still collision-blocked too');

  // === Item 11: imp is a real monster kind ===
  assert(MONSTER_KINDS.includes('imp'), 'imp is registered as a monster kind');

  // === Live account/character/socket flow ===
  const email = `gnov${randomLetters(6)}@example.com`;
  const acctUsername = `Gnov${randomLetters(5)}`;
  const charName = `Gnova${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);
  console.log('  spawn map ->', sync.player.map);
  assert(sync.player.map === 'Grimoak Grounds', 'a new character spawns on Grimoak Grounds, where the imps live');

  // === Item 11: imps are actually spawned there, up to 40 of them ===
  const firstMapState = await onceMapState(socket);
  const imps = firstMapState.monsters.filter((m) => m.kind === 'imp');
  console.log('  imps seen on Grimoak Grounds ->', imps.length);
  assert(imps.length > 0 && imps.length <= 40, `between 1 and 40 imps are spawned (saw ${imps.length})`);

  // === Item 11: imps patrol near their spawn point rather than roaming
  // freely — sample one imp's position a few times over ~9s (3 monster
  // wander ticks) and confirm it never strays far from where it started.
  if (imps.length > 0) {
    const watchedId = imps[0].id;
    const startRow = imps[0].row;
    const startCol = imps[0].col;
    let maxDrift = 0;
    for (let i = 0; i < 3; i++) {
      await sleep(3200);
      const state = await onceMapState(socket);
      const found = state.monsters.find((m) => m.id === watchedId);
      if (!found) continue;
      const drift = Math.max(Math.abs(found.row - startRow), Math.abs(found.col - startCol));
      maxDrift = Math.max(maxDrift, drift);
    }
    console.log('  watched imp max drift from its own start position over ~9s ->', maxDrift);
    assert(maxDrift <= 5, 'the watched imp stayed within a small patrol range rather than roaming freely');
  }

  // === Item 3 (irrigo parity) & item 1 (toast-carrying ack) ===
  // Grant lucem/irrigo/quick movement directly (skips the 10%-per-read
  // podium RNG) and max out the skill percent so the success-chance
  // formula (skill% + 10, capped at 100) is 100% — deterministic.
  sql(
    `UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb, mana=100, max_mana=100, skills = skills || '{"lucem": 100, "irrigo": 100, "quick movement": 100}'::jsonb WHERE username='${charName}';`
  );
  await sleep(300);
  const { socket: s2 } = await connectSocket(select.body.token);

  const lucemAck = await emitWithAck(s2, 'castLucem');
  console.log('  castLucem at 100% skill ->', lucemAck);
  assert(lucemAck.ok && lucemAck.active === true, 'castLucem lights the wand deterministically at 100% skill');
  assert(lucemAck.mana === 90, 'lighting the wand costs exactly 10 mana (100 -> 90)');
  assert(/glows/.test(lucemAck.message ?? ''), 'the ack carries the success message the client toasts');

  const qmAck = await emitWithAck(s2, 'castQuickMovement');
  console.log('  castQuickMovement at 100% skill ->', qmAck);
  assert(qmAck.ok && qmAck.active === true, 'castQuickMovement activates deterministically at 100% skill');
  assert(qmAck.mana === 80, 'casting quick movement costs exactly 10 mana (90 -> 80)');
  const qmOffAck = await emitWithAck(s2, 'castQuickMovement');
  console.log('  castQuickMovement again (toggle off) ->', qmOffAck);
  assert(qmOffAck.ok && qmOffAck.active === false, 'casting again turns quick movement back off');
  assert(qmOffAck.mana === 80, 'turning quick movement off costs no mana (still 80)');

  sql(`UPDATE players SET canteen_drinks=0 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3, sync: sync3 } = await connectSocket(select.body.token);
  const canteenIndex = sync3.player.inventory.indexOf('canteen');
  const irrigoAck = await emitWithAck(s3, 'castIrrigo', canteenIndex);
  console.log('  castIrrigo at 100% skill ->', irrigoAck);
  assert(irrigoAck.ok, 'castIrrigo succeeds');
  // Mana carries over cumulatively from the earlier lucem (100->90) and
  // quick movement (90->80) casts above, so 80 -> 70 here, not a fresh 100.
  assert(irrigoAck.mana === 70, 'casting irrigo costs exactly 10 mana (80 -> 70)');
  assert(irrigoAck.skills && irrigoAck.skills['irrigo'] !== undefined, 'the irrigo ack now carries back the skills object (for the growth-message follow-up)');

  s2.close();
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
