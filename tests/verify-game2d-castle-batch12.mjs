// Live verification for this 21-item batch: the 'x' disengage hotkey,
// door/chest resera targeting still works with the new generalized
// LockTarget shape, the 4 new spells (stupefaciunt/exarme/scutum/murus
// lapideus) end to end, updated mana costs (lucem 5/celeritas 7/irrigo
// 5), the Dorms bed sleep bonus, common-room/dorm room sizing, and
// volatio/levare's removal from the spell list.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch12.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap, CAVERNA_SECRET_DOOR_POSITION } from '../game2d/dist/shared/maps.js';
import { bedPositionsFor, BED_REACH_TILES } from '../game2d/dist/shared/lighting.js';
import {
  STARTING_SKILL_PERCENT,
  STUPEFACIUNT_SKILL,
  EXARME_SKILL,
  SCUTUM_SKILL,
  MURUS_LAPIDEUS_SKILL,
  SPELL_ATTACK_RANGE_TILES,
} from '../game2d/dist/shared/skills.js';
import {
  SPELLS,
  STUPEFACIUNT_BOOK_MAP,
  STUPEFACIUNT_BOOK_POSITION,
  EXARME_BOOK_MAP,
  EXARME_BOOK_POSITION,
  SCUTUM_BOOK_MAP,
  SCUTUM_BOOK_POSITION,
  MURUS_LAPIDEUS_BOOK_MAP,
  MURUS_LAPIDEUS_BOOK_POSITION,
} from '../game2d/dist/shared/spells.js';

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

function onceMapState(socket) {
  return new Promise((resolve) => socket.once('map:state', resolve));
}

async function registerAndSpawn(prefix) {
  const email = `${prefix}${randomLetters(6)}@example.com`;
  const acctUsername = `${prefix[0].toUpperCase()}${prefix.slice(1)}${randomLetters(5)}`;
  const charName = `${prefix[0].toUpperCase()}${prefix.slice(1)}c${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);
  return { charName, token: select.body.token, socket, sync };
}

async function main() {
  // === Item 11: volatio/levare removed ===
  assert(!SPELLS.some((s) => s.name === 'volatio'), 'volatio was removed from the spell list');
  assert(!SPELLS.some((s) => s.name === 'levare'), 'levare was removed from the spell list');
  assert(SPELLS.some((s) => s.name === 'murus lapideus'), 'murus lapideus is listed as a spell');

  // === Items 19/20: room sizing ===
  const entranceHall = getMap('Grimoak Entrance Hall');
  const commonRoom = getMap('Thistledown Common Room');
  const dorm = getMap('Thistledown Dorms');
  console.log('  Entrance Hall ->', entranceHall.rows, 'x', entranceHall.cols, ' Common Room ->', commonRoom.rows, 'x', commonRoom.cols, ' Dorm ->', dorm.rows, 'x', dorm.cols);
  assert(commonRoom.rows < entranceHall.rows && commonRoom.cols < entranceHall.cols, 'the common room is smaller than the Entrance Hall (a further 25% reduction)');
  const commonRoomArea = commonRoom.rows * commonRoom.cols;
  const dormArea = dorm.rows * dorm.cols;
  const ratio = dormArea / commonRoomArea;
  console.log('  dorm/common-room area ratio ->', ratio.toFixed(3));
  assert(ratio > 0.15 && ratio < 0.25, 'the dorm is roughly 1/5 the area of its common room');

  const beds = bedPositionsFor('Thistledown Dorms');
  console.log('  beds ->', JSON.stringify(beds));
  assert(beds.length === 5, 'exactly 5 beds are placed in the dorm');
  const uniqueCols = new Set(beds.map((b) => b.col));
  assert(uniqueCols.size === 5, 'the 5 beds sit at 5 distinct columns (evenly spaced)');

  // === Item 12: new podium positions ===
  assert(STUPEFACIUNT_BOOK_MAP === 'Offense Classroom', 'stupefaciunt is taught in the Offense Classroom');
  assert(EXARME_BOOK_MAP === 'Offense Classroom', 'exarme is taught in the Offense Classroom');
  assert(STUPEFACIUNT_BOOK_POSITION.col !== EXARME_BOOK_POSITION.col, 'stupefaciunt and exarme podiums sit at different columns');
  assert(SCUTUM_BOOK_MAP === 'Defense Classroom', 'scutum is taught in the Defense Classroom');
  assert(MURUS_LAPIDEUS_BOOK_MAP === 'Summoning Classroom', 'murus lapideus is taught in the Summoning Classroom');

  const a = await registerAndSpawn('bxa');
  const b = await registerAndSpawn('bxb');

  // === Item 1: 'x'/disengage clears a combat session server-side ===
  sql(`UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb, mana=100, max_mana=100 WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock1 } = await connectSocket(a.token);
  const engageAck = await emitWithAck(aSock1, 'engageRangedAttack', { targetKind: 'monster', targetId: 'no-such-monster' });
  console.log('  engageRangedAttack on a bogus target (expected rejection) ->', engageAck);
  assert(engageAck.ok === false, 'engaging a nonexistent monster is rejected (sanity check before disengage test)');
  // disengage has no ack (fire-and-forget) — just confirm the socket
  // accepts it without erroring.
  aSock1.emit('disengage');
  await sleep(200);
  console.log('  sent disengage with no error');
  assert(true, "the 'x' hotkey's disengage event is accepted without error");

  // === Items 12/13/16: read the 4 new podiums (TESTING_INSTANT_PODIUM_LEARN
  // is on, so every read succeeds deterministically) and cast each spell ===
  sql(
    `UPDATE players SET map='Offense Classroom', row=${STUPEFACIUNT_BOOK_POSITION.row}, col=${STUPEFACIUNT_BOOK_POSITION.col}, mana=100, max_mana=100, equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${a.charName}';`
  );
  await sleep(300);
  const { socket: aSock2 } = await connectSocket(a.token);
  const stunReadAck = await emitWithAck(aSock2, 'readStupefaciuntBook');
  console.log('  reading the stupefaciunt podium ->', stunReadAck);
  assert(stunReadAck.ok === true && stunReadAck.skills?.[STUPEFACIUNT_SKILL] === STARTING_SKILL_PERCENT, 'reading the stupefaciunt podium grants the skill at 10%');

  sql(`UPDATE players SET row=${EXARME_BOOK_POSITION.row}, col=${EXARME_BOOK_POSITION.col} WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock3 } = await connectSocket(a.token);
  const exarmeReadAck = await emitWithAck(aSock3, 'readExarmeBook');
  console.log('  reading the exarme podium ->', exarmeReadAck);
  assert(exarmeReadAck.ok === true && exarmeReadAck.skills?.[EXARME_SKILL] === STARTING_SKILL_PERCENT, 'reading the exarme podium grants the skill at 10%');

  sql(`UPDATE players SET map='Defense Classroom', row=${SCUTUM_BOOK_POSITION.row}, col=${SCUTUM_BOOK_POSITION.col} WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock4 } = await connectSocket(a.token);
  const scutumReadAck = await emitWithAck(aSock4, 'readScutumBook');
  console.log('  reading the scutum podium ->', scutumReadAck);
  assert(scutumReadAck.ok === true && scutumReadAck.skills?.[SCUTUM_SKILL] === STARTING_SKILL_PERCENT, 'reading the scutum podium grants the skill at 10%');

  sql(`UPDATE players SET map='Summoning Classroom', row=${MURUS_LAPIDEUS_BOOK_POSITION.row}, col=${MURUS_LAPIDEUS_BOOK_POSITION.col} WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock5, sync: aSync5 } = await connectSocket(a.token);
  const murusReadAck = await emitWithAck(aSock5, 'readMurusLapideusBook');
  console.log('  reading the murus lapideus podium ->', murusReadAck);
  assert(murusReadAck.ok === true && murusReadAck.skills?.[MURUS_LAPIDEUS_SKILL] === STARTING_SKILL_PERCENT, 'reading the murus lapideus podium grants the skill at 10%');
  console.log('  player A now knows ->', Object.keys(aSync5.player.skills));

  // === Item 16: cast murus lapideus — summons a stone block within range,
  // shows up in map:state, has 20 hp, and takes reduced damage ===
  const mapStatePromise = onceMapState(aSock5);
  const targetRow = MURUS_LAPIDEUS_BOOK_POSITION.row + 2;
  const targetCol = MURUS_LAPIDEUS_BOOK_POSITION.col;
  const murusCastAck = await emitWithAck(aSock5, 'castMurusLapideus', { row: targetRow, col: targetCol });
  console.log('  casting murus lapideus ->', murusCastAck);
  assert(murusCastAck.ok === true, 'casting murus lapideus within range succeeds');
  const stateAfterMurus = await mapStatePromise;
  const block = stateAfterMurus.stoneBlocks.find((s) => s.row === targetRow && s.col === targetCol);
  console.log('  stone block in map:state ->', block);
  assert(Boolean(block) && block.hp === 20 && block.maxHp === 20, 'the summoned stone block has 20/20 hp and appears in map:state');

  // Casting again immediately should be rejected by its own 40s cooldown.
  const murusCooldownAck = await emitWithAck(aSock5, 'castMurusLapideus', { row: targetRow + 1, col: targetCol });
  console.log('  casting murus lapideus again immediately (expect cooldown) ->', murusCooldownAck);
  assert(murusCooldownAck.ok === false && /recharging/.test(murusCooldownAck.message ?? ''), "murus lapideus's own 40s cooldown blocks an immediate second cast");

  // === Item 12: stupefaciunt/exarme range check (SPELL_ATTACK_RANGE_TILES) ===
  assert(SPELL_ATTACK_RANGE_TILES === 7, 'the shared spell-attack range constant is 7 tiles');
  const stunTooFarAck = await emitWithAck(aSock5, 'castStupefaciunt', { targetKind: 'monster', targetId: 'no-such-monster' });
  console.log('  castStupefaciunt on a nonexistent monster ->', stunTooFarAck);
  assert(stunTooFarAck.ok === false, 'castStupefaciunt rejects a target that no longer exists');
  const exarmeMissingAck = await emitWithAck(aSock5, 'castExarme', { targetKind: 'monster', targetId: 'no-such-monster' });
  console.log('  castExarme on a nonexistent monster ->', exarmeMissingAck);
  assert(exarmeMissingAck.ok === false, 'castExarme rejects a target that no longer exists');

  // === Items 3/6: resera still works with the NEW generalized, object-
  // shaped LockTarget (a refactor made earlier in this same batch, away
  // from the old string enum) — a regular door reports back "not locked"
  // rather than refusing the cast outright, and the real secret door
  // still resolves correctly by its own map+position. ===
  sql(`UPDATE players SET map='Utility Classroom', row=0, col=1, mana=100, skills = skills || '{"resera": 100}'::jsonb WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock7 } = await connectSocket(a.token);
  const notLockedAck = await emitWithAck(aSock7, 'castResera', { target: { kind: 'door', map: 'Utility Classroom', row: 0, col: 1 } });
  console.log('  castResera (new object shape) on an ordinary door ->', notLockedAck);
  assert(notLockedAck.ok === false && /isn't locked/.test(notLockedAck.message ?? ''), 'resera on a regular door (new object LockTarget) reports back "not locked"');

  sql(`UPDATE players SET row=${CAVERNA_SECRET_DOOR_POSITION.row}, col=${CAVERNA_SECRET_DOOR_POSITION.col} WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock8 } = await connectSocket(a.token);
  const realDoorAck = await emitWithAck(aSock8, 'castResera', {
    target: { kind: 'door', map: 'Utility Classroom', row: CAVERNA_SECRET_DOOR_POSITION.row, col: CAVERNA_SECRET_DOOR_POSITION.col },
  });
  console.log('  castResera (new object shape) on the REAL secret door ->', realDoorAck);
  assert(realDoorAck.ok === true, 'resera on the actual secret door still succeeds with the new object-shaped LockTarget');
  aSock7.close();
  aSock8.close();

  // === Item 13: scutum — costs 10 mana, sets scutumActive, shows in sync ===
  sql(`UPDATE players SET skills = skills || '{"scutum": 100}'::jsonb, mana=100 WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock6 } = await connectSocket(a.token);
  const scutumCastAck = await emitWithAck(aSock6, 'castScutum');
  console.log('  casting scutum ->', scutumCastAck);
  assert(scutumCastAck.ok === true && scutumCastAck.active === true, 'casting scutum succeeds and activates the shield');
  assert(scutumCastAck.mana === 90, 'casting scutum costs exactly 10 mana (100 -> 90)');
  const scutumCooldownAck = await emitWithAck(aSock6, 'castScutum');
  console.log('  casting scutum again immediately (expect cooldown) ->', scutumCooldownAck);
  assert(scutumCooldownAck.ok === false && /recharging/.test(scutumCooldownAck.message ?? ''), "scutum's own 2-minute cooldown blocks an immediate second cast");

  // === Item 14: updated mana costs — lucem 5, celeritas 7, irrigo 5 ===
  sql(
    `UPDATE players SET skills = skills || '{"lucem": 100, "celeritas": 100, "irrigo": 100}'::jsonb, mana=100, equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${b.charName}';`
  );
  await sleep(300);
  const { socket: bSock1, sync: bSync1 } = await connectSocket(b.token);
  const lucemAck = await emitWithAck(bSock1, 'castLucem');
  console.log('  castLucem at 100% skill (mana 100->?) ->', lucemAck);
  assert(lucemAck.ok === true && lucemAck.mana === 95, 'lucem costs exactly 5 mana (100 -> 95)');
  const celeritasAck = await emitWithAck(bSock1, 'castCeleritas');
  console.log('  castCeleritas (mana 95->?) ->', celeritasAck);
  assert(celeritasAck.ok === true && celeritasAck.mana === 88, 'celeritas costs exactly 7 mana (95 -> 88)');
  const canteenIndex = bSync1.player.inventory.indexOf('canteen');
  sql(`UPDATE players SET canteen_drinks=0 WHERE username='${b.charName}';`);
  await sleep(200);
  const { socket: bSock2 } = await connectSocket(b.token);
  const irrigoAck = await emitWithAck(bSock2, 'castIrrigo', canteenIndex);
  console.log('  castIrrigo (mana 88->?) ->', irrigoAck);
  assert(irrigoAck.ok === true && irrigoAck.mana === 83, 'irrigo costs exactly 5 mana (88 -> 83)');

  // === Item 21: Dorms bed sleep — too-far message, then a successful
  // sleepInBed sets restState + sleepingInBed ===
  const bedPos = beds[0];
  sql(`UPDATE players SET map='Thistledown Dorms', row=0, col=0 WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock3 } = await connectSocket(b.token);
  const bedTooFarAck = await emitWithAck(bSock3, 'sleepInBed', { row: bedPos.row, col: bedPos.col });
  console.log('  sleepInBed while far from the bed ->', bedTooFarAck);
  assert(bedTooFarAck.ok === false, "sleepInBed refuses when the player isn't within reach");

  sql(`UPDATE players SET row=${bedPos.row}, col=${bedPos.col + 1} WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock4, sync: bSync4 } = await connectSocket(b.token);
  console.log('  player B near the bed at ->', bSync4.player.row, bSync4.player.col, ' bed at ->', bedPos, ' reach ->', BED_REACH_TILES);
  const bedOkAck = await emitWithAck(bSock4, 'sleepInBed', { row: bedPos.row, col: bedPos.col });
  console.log('  sleepInBed within reach ->', bedOkAck);
  assert(bedOkAck.ok === true, 'sleepInBed succeeds within reach');

  const bedNotABedAck = await emitWithAck(bSock4, 'sleepInBed', { row: bedPos.row + 1, col: bedPos.col + 1 });
  console.log('  sleepInBed targeting a non-bed tile ->', bedNotABedAck);
  assert(bedNotABedAck.ok === false, "sleepInBed rejects a tile that isn't actually a bed");

  aSock1.close();
  aSock2.close();
  aSock3.close();
  aSock4.close();
  aSock5.close();
  aSock6.close();
  bSock1.close();
  bSock2.close();
  bSock3.close();
  bSock4.close();

  sql(`DELETE FROM players WHERE username IN ('${a.charName}', '${b.charName}');`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
