// Live verification for this 12-item batch: room resize (Great Hall/
// common rooms match the Entrance Hall), 3 immortal/targetable scarecrows
// in the Entrance Hall, wand-only ranged auto-attack (right-click ->
// engageRangedAttack, 7-tile range, repeats every combat tick), the
// secret room + its independently-locked door/chest + resera spell
// (per-player, never shared), map access gated behind actually taking
// the map out of the chest (Baltar/new-character parity), and the real
// item never entering the inventory.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch11.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap, CAVERNA_SECRET_DOOR_POSITION, CAVERNA_CHEST_POSITION } from '../game2d/dist/shared/maps.js';
import { isPodiumBlocked, isChestBlocked, RESERA_BOOK_MAP, RESERA_BOOK_POSITION } from '../game2d/dist/shared/spells.js';
import { STARTING_SKILL_PERCENT, RESERA_SKILL, WAND_BOLT_SKILL } from '../game2d/dist/shared/skills.js';
import { NPCS } from '../game2d/dist/server/worlds/npcs.js';

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
  // === Item 11: Great Hall / common rooms match the Entrance Hall's size ===
  const entranceHall = getMap('Grimoak Entrance Hall');
  const greatHall = getMap('Great Hall');
  const thistledown = getMap('Thistledown Common Room');
  console.log('  Entrance Hall ->', entranceHall.rows, 'x', entranceHall.cols, ' Great Hall ->', greatHall.rows, 'x', greatHall.cols, ' Thistledown ->', thistledown.rows, 'x', thistledown.cols);
  assert(greatHall.rows === entranceHall.rows && greatHall.cols === entranceHall.cols, "Great Hall matches the Entrance Hall's size");
  assert(thistledown.rows === entranceHall.rows && thistledown.cols === entranceHall.cols, "a common room (Thistledown) matches the Entrance Hall's size");

  // === Item 9: 3 immortal, labeled scarecrows in the Entrance Hall ===
  const scarecrows = NPCS.filter((n) => n.map === 'Grimoak Entrance Hall' && n.label === 'scarecrow');
  console.log('  scarecrows ->', scarecrows.map((s) => ({ id: s.id, row: s.row, col: s.col, immortal: s.immortal })));
  assert(scarecrows.length === 3, 'exactly 3 scarecrows are placed in the Entrance Hall');
  assert(scarecrows.every((s) => s.immortal === true), 'every scarecrow is immortal');

  // === Item 2/4: the secret room's door + chest positions/collision ===
  console.log('  secret door ->', CAVERNA_SECRET_DOOR_POSITION, ' chest ->', CAVERNA_CHEST_POSITION);
  const cavernaMap = getMap('Caverna Secretissima');
  assert(cavernaMap.name === 'Caverna Secretissima', 'the secret room map exists');
  const backToUtility = cavernaMap.exits.find((e) => e.toMap === RESERA_BOOK_MAP);
  assert(Boolean(backToUtility), 'the secret room has an exit back to the Utility Classroom');
  const intoSecret = getMap(RESERA_BOOK_MAP).exits.find((e) => e.toMap === 'Caverna Secretissima');
  assert(Boolean(intoSecret), 'the Utility Classroom has an exit into the secret room');
  assert(
    intoSecret.toRow === backToUtility.row && intoSecret.toCol === backToUtility.col,
    "the Utility->secret-room exit lands exactly on the secret room's own return-exit tile"
  );
  assert(isChestBlocked('Caverna Secretissima', CAVERNA_CHEST_POSITION.row, CAVERNA_CHEST_POSITION.col), 'the treasure chest tile is collision-blocked');
  assert(isPodiumBlocked(RESERA_BOOK_MAP, RESERA_BOOK_POSITION.row, RESERA_BOOK_POSITION.col), 'the resera podium is collision-blocked');
  assert(STARTING_SKILL_PERCENT === 10, 'STARTING_SKILL_PERCENT is still 10');

  const a = await registerAndSpawn('resa');
  const b = await registerAndSpawn('resb');
  console.log('  player A spawn mapUnlocked ->', a.sync.player.mapUnlocked, '  player B spawn mapUnlocked ->', b.sync.player.mapUnlocked);
  assert(a.sync.player.mapUnlocked !== true, 'a fresh character does NOT start with mapUnlocked');
  assert(b.sync.player.mapUnlocked !== true, 'a second fresh character also does NOT start with mapUnlocked (Baltar/new-character parity)');
  a.socket.close();
  b.socket.close();

  // --- B stands at the secret door BEFORE anyone has ever unlocked it ---
  sql(`UPDATE players SET map='Utility Classroom', row=${CAVERNA_SECRET_DOOR_POSITION.row}, col=${CAVERNA_SECRET_DOOR_POSITION.col} WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock1 } = await connectSocket(b.token);
  const bBlockedFirst = await move(bSock1, 'north');
  console.log('  player B tries the door before it has ever been unlocked ->', bBlockedFirst);
  assert(bBlockedFirst.ok === false, "the secret door is locked for a player who's never cast resera on it");
  bSock1.close();
  await sleep(200);

  // --- A: wand + max mana + 100% resera (deterministic success), at the
  // door tile itself, reads the podium first (item 4's own "learn resera
  // at the third Utility podium" ask, verified end-to-end here rather
  // than granted purely by SQL). ---
  sql(
    `UPDATE players SET map='Utility Classroom', row=${RESERA_BOOK_POSITION.row}, col=${RESERA_BOOK_POSITION.col}, mana=100, max_mana=100, equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${a.charName}';`
  );
  await sleep(300);
  const { socket: aSockPodium } = await connectSocket(a.token);
  const readAck = await emitWithAck(aSockPodium, 'readReseraBook');
  console.log('  player A reads the "Secrets of the lock" podium ->', readAck);
  assert(readAck.ok === true && readAck.skills?.[RESERA_SKILL] === STARTING_SKILL_PERCENT, 'reading the resera podium grants the skill at the standard starting percent');
  aSockPodium.close();
  await sleep(200);

  // Max out resera's own skill percent via SQL (bypassing the slow
  // in-game growth grind) so the success-chance formula (skill% + 10,
  // capped at 100) is a deterministic 100% for the rest of this test,
  // then reposition to the door tile itself.
  sql(`UPDATE players SET row=${CAVERNA_SECRET_DOOR_POSITION.row}, col=${CAVERNA_SECRET_DOOR_POSITION.col}, skills = skills || '{"resera": 100}'::jsonb WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock } = await connectSocket(a.token);

  const castNoTarget = await emitWithAck(aSock, 'castResera', { target: 'bogus' });
  console.log('  castResera with an invalid target ->', castNoTarget);
  assert(castNoTarget.ok === false, 'castResera rejects an invalid LockTarget');

  const doorCast = await emitWithAck(aSock, 'castResera', { target: 'secret-door' });
  console.log('  player A casts resera on the door (100% skill) ->', doorCast);
  assert(doorCast.ok === true, 'castResera on the door succeeds at 100% skill');

  const aMoveResult = await move(aSock, 'north');
  console.log('  player A walks north through the now-unlocked door ->', aMoveResult.ok, aMoveResult.player?.map, aMoveResult.player?.row, aMoveResult.player?.col);
  assert(aMoveResult.ok === true, 'player A can now walk into the secret room');
  assert(aMoveResult.player?.map === 'Caverna Secretissima', 'player A actually landed in Caverna Secretissima');

  // --- B still can't get through, even now that A has unlocked it ---
  sql(`UPDATE players SET map='Utility Classroom', row=${CAVERNA_SECRET_DOOR_POSITION.row}, col=${CAVERNA_SECRET_DOOR_POSITION.col} WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock2 } = await connectSocket(b.token);
  const bStillBlocked = await move(bSock2, 'north');
  console.log("  player B tries the same door AFTER A unlocked it (never unlocked it themselves) ->", bStillBlocked);
  assert(bStillBlocked.ok === false, "one player's unlock doesn't unlock the door for anyone else");
  bSock2.close();

  // --- The chest is reach-gated independently of the door's own unlock ---
  const openTooFar = await emitWithAck(aSock, 'openChest');
  console.log('  player A tries the chest right after stepping through the door (too far away) ->', openTooFar);
  assert(openTooFar.ok === false, "the chest can't be reached immediately after entering — reach is checked independently of the door");

  sql(`UPDATE players SET map='Caverna Secretissima', row=${CAVERNA_CHEST_POSITION.row}, col=${CAVERNA_CHEST_POSITION.col + 1} WHERE username='${a.charName}';`);
  await sleep(300);
  const { socket: aSock2 } = await connectSocket(a.token);

  const openBeforeUnlock = await emitWithAck(aSock2, 'openChest');
  console.log('  player A tries the chest before casting resera on IT ->', openBeforeUnlock);
  assert(openBeforeUnlock.ok === false, 'the chest is still locked even though the door is already unlocked (independent locks)');

  const chestCast = await emitWithAck(aSock2, 'castResera', { target: 'caverna-chest' });
  console.log('  player A casts resera on the chest ->', chestCast);
  assert(chestCast.ok === true, 'castResera on the chest succeeds at 100% skill');

  const doorCastAgain = await emitWithAck(aSock2, 'castResera', { target: 'secret-door' });
  console.log('  player A casts resera on the door AGAIN (already unlocked) ->', doorCastAgain);
  assert(/already/.test(doorCastAgain.message ?? ''), "resera-ing an already-unlocked door just reports back that it's already unlocked");

  const openAck = await emitWithAck(aSock2, 'openChest');
  console.log('  player A opens the now-unlocked chest ->', openAck);
  assert(openAck.ok === true, "openChest succeeds once the chest is resera'd open");
  assert(Array.isArray(openAck.items) && openAck.items.includes('map'), "the chest holds a map the first time it's opened");

  const takeAck = await emitWithAck(aSock2, 'takeChestItem');
  console.log('  player A takes the map ->', { ok: takeAck.ok, mapUnlocked: takeAck.player?.mapUnlocked, message: takeAck.message });
  assert(takeAck.ok === true && takeAck.player?.mapUnlocked === true, "taking the map flips this player's own mapUnlocked flag");
  assert(!takeAck.player?.inventory?.includes('map'), 'taking the map does NOT add a real inventory item — it only unlocks the map UI');

  const takeAgainAck = await emitWithAck(aSock2, 'takeChestItem');
  console.log('  player A tries to take the map a second time ->', takeAgainAck);
  assert(takeAgainAck.ok === false, "the chest never gives out a second item to the same player once it's already been taken");

  const openAgainAck = await emitWithAck(aSock2, 'openChest');
  console.log('  player A opens the (now empty) chest again ->', openAgainAck);
  assert(openAgainAck.ok === true && Array.isArray(openAgainAck.items) && openAgainAck.items.length === 0, 'the chest is empty on every subsequent open for this player');

  const bFreshCheck = sql(`SELECT map_unlocked FROM players WHERE username='${b.charName}';`);
  console.log("  player B's own map_unlocked column ->", bFreshCheck);
  assert(bFreshCheck.includes('f'), "player B (never unlocked anything) still has mapUnlocked=false in the DB");

  aSock.close();
  aSock2.close();

  // === Item 8: wand-only ranged auto-attack — engageRangedAttack rejects
  // without a wand equipped, and works at range against a scarecrow. ===
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=${scarecrows[0].row}, col=${scarecrows[0].col - 3}, equipment='{}'::jsonb WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock3 } = await connectSocket(b.token);
  const noWandAck = await emitWithAck(bSock3, 'engageRangedAttack', { targetKind: 'npc', targetId: scarecrows[0].id });
  console.log('  engageRangedAttack with no wand equipped ->', noWandAck);
  assert(noWandAck.ok === false, 'engageRangedAttack refuses without a wand equipped');
  bSock3.close();

  sql(`UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${b.charName}';`);
  await sleep(300);
  const { socket: bSock4, sync: bSync4 } = await connectSocket(b.token);
  console.log('  player B repositioned near a scarecrow, wand equipped, at ->', bSync4.player.row, bSync4.player.col, ' scarecrow at ->', scarecrows[0].row, scarecrows[0].col);
  const rangedAck = await emitWithAck(bSock4, 'engageRangedAttack', { targetKind: 'npc', targetId: scarecrows[0].id });
  console.log('  engageRangedAttack on a scarecrow within 7 tiles, wand equipped ->', rangedAck);
  assert(rangedAck.ok === true, 'engageRangedAttack succeeds on a scarecrow within 7 tiles while a wand is equipped');

  let sawCombatEvent = false;
  bSock4.on('combat', (evt) => {
    if (evt.skill === WAND_BOLT_SKILL) sawCombatEvent = true;
  });
  await sleep(3500);
  console.log('  saw a wand-bolt combat event within one tick ->', sawCombatEvent);
  assert(sawCombatEvent, 'a wand-bolt combat event actually fires against the scarecrow on the next combat tick');

  await sleep(6500);
  const midState = await onceMapState(bSock4);
  const stillThere = midState.npcs.find((n) => n.id === scarecrows[0].id);
  console.log('  scarecrow hp after several auto-attack ticks ->', stillThere?.hp, '/', stillThere?.maxHp);
  assert(Boolean(stillThere) && stillThere.hp > 0, 'the scarecrow is still standing (immortal — never leaves a corpse) after repeated hits');

  bSock4.close();

  // === Cleanup: only the test-prefixed accounts/characters this run
  // itself created ===
  sql(`DELETE FROM players WHERE username IN ('${a.charName}', '${b.charName}');`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
