// Live verification for this 11-item batch. Covers what's cleanly
// server-observable: unequipping the wand cancels an active lucem (and a
// re-equip doesn't silently resume the glow), murus lapideus only starts
// its cooldown on an actual success (not a fumble), the new house-
// assignment teacher's chooseHouse event (choose once, reject a second
// choice, gate entry into the WRONG house's Common Room, allow entry into
// your OWN house's Common Room), and the Specialization room's
// chooseSpecialization event (level-gated, choose once, reject a second
// choice).
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck + a manual dev-server/image check):
// the collapsible action bar, bigger teacher eyes, the classroom door
// symbols now sitting beside the door, Hollowell/her desk facing the
// benches, the bench modal's own range gate (already correct before this
// batch — re-confirmed by code read, not re-tested here), teacher hair no
// longer looking like a bun, and each teacher's own distinct robe color.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch21.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

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
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    let sync, mapState;
    socket.once('sync', (s) => (sync = s));
    socket.once('map:state', (m) => (mapState = m));
    socket.once('connect_error', reject);
    const timer = setInterval(() => {
      if (sync && mapState) {
        clearInterval(timer);
        resolve({ socket, sync, mapState });
      }
    }, 25);
    setTimeout(() => {
      clearInterval(timer);
      reject(new Error('sync/map:state timeout'));
    }, 5000);
  });
}

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

async function registerAndSpawn(prefix) {
  const email = `${prefix}${randomLetters(6)}@example.com`;
  const acctUsername = `${prefix[0].toUpperCase()}${prefix.slice(1)}${randomLetters(5)}`;
  const charName = `${prefix[0].toUpperCase()}${prefix.slice(1)}c${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync, mapState } = await connectSocket(select.body.token);
  return { charName, token: select.body.token, socket, sync, mapState };
}

async function main() {
  const owner = await registerAndSpawn('batchu');

  // === Item 7: unequipping the wand while lucem is active cancels it,
  // and re-equipping the SAME wand later doesn't silently resume the glow. ===
  sql(`UPDATE players SET map='Grimoak Grounds', row=5, col=5, mana=1000, max_mana=1000, equipment='{"weapon":"wand"}'::jsonb, skills = skills || '{"lucem": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: lucemSock } = await connectSocket(owner.token);
  let lucemAck;
  for (let i = 0; i < 20; i++) {
    lucemAck = await emitWithAck(lucemSock, 'castLucem');
    if (lucemAck.active) break;
  }
  console.log('  castLucem ->', lucemAck);
  assert(Boolean(lucemAck?.active), 'lucem is lit before unequipping the wand');
  const unequipAck = await emitWithAck(lucemSock, 'unequipItem', 'weapon');
  console.log('  unequipItem(weapon) while lucem lit ->', unequipAck);
  assert(unequipAck.ok === true, 'unequipping the wand succeeds');
  assert(/dark/i.test(unequipAck.message ?? ''), `unequipping while lit mentions the wand going dark (message: "${unequipAck.message}")`);
  lucemSock.close();
  await sleep(300);
  // Re-equip the SAME wand from a FRESH connection and confirm wandLit
  // reads false — i.e. it didn't silently carry over/resume.
  sql(`UPDATE players SET equipment='{"weapon":"wand"}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: reequipSock, sync: reequipSync } = await connectSocket(owner.token);
  assert(reequipSync.player.wandLit === false, `wandLit reads false after re-equipping the wand without recasting (wandLit: ${reequipSync.player.wandLit})`);
  reequipSock.close();

  // === Item 8: murus lapideus only starts its cooldown on an actual
  // success, not a fumble — force a near-guaranteed fumble (skill% 1 -> 11%
  // success chance) and confirm an immediate re-cast right after a fumble
  // is never rejected as "still recharging". ===
  sql(`UPDATE players SET map='Grimoak Grounds', row=5, col=5, mana=100000, max_mana=100000, skills = skills || '{"murus lapideus": 1}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: murusSock } = await connectSocket(owner.token);
  let sawFumble = false;
  let sawCooldownRightAfterFumble = false;
  for (let i = 0; i < 40 && !sawFumble; i++) {
    const ack = await emitWithAck(murusSock, 'castMurusLapideus', { row: 5, col: 8 });
    if (ack.ok && /fumble/i.test(ack.message ?? '')) {
      sawFumble = true;
      console.log('  murus fumble ->', ack.message);
      const nextAck = await emitWithAck(murusSock, 'castMurusLapideus', { row: 5, col: 8 });
      console.log('  murus cast immediately after fumble ->', nextAck.message);
      sawCooldownRightAfterFumble = /recharging/i.test(nextAck.message ?? '');
    }
  }
  assert(sawFumble, 'observed at least one murus lapideus fumble within 40 attempts');
  assert(!sawCooldownRightAfterFumble, 'a fumbled murus lapideus cast does NOT start its cooldown');
  murusSock.close();

  // === Item 10: the house-assignment teacher's chooseHouse event ===
  sql(`UPDATE players SET house=NULL WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: houseSock } = await connectSocket(owner.token);
  const badHouseAck = await emitWithAck(houseSock, 'chooseHouse', { house: 'NotAHouse' });
  assert(badHouseAck.ok === false, 'chooseHouse rejects an invalid house name');
  const chooseAck = await emitWithAck(houseSock, 'chooseHouse', { house: 'Emberclaw' });
  console.log('  chooseHouse(Emberclaw) ->', chooseAck);
  assert(chooseAck.ok === true, 'chooseHouse succeeds the first time');
  const rechooseAck = await emitWithAck(houseSock, 'chooseHouse', { house: 'Duskwing' });
  console.log('  chooseHouse again ->', rechooseAck);
  assert(rechooseAck.ok === false && /already/i.test(rechooseAck.message ?? ''), 'choosing a house a second time is rejected as already chosen');
  houseSock.close();
  // handleDisconnect's own persistPosition writes this SOCKET's stale
  // in-memory row/col back to the DB — give it time to finish before the
  // next SQL position update, or it can race and get clobbered right back.
  await sleep(300);

  // Wrong house's Common Room is off-limits — Duskwing Common Room's own
  // Entrance Hall doorway sits at (row 24, col ENTRANCE_COLS-1), moving
  // 'east' from there attempts the transition.
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=24, col=49 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: wrongHouseSock } = await connectSocket(owner.token);
  const wrongHouseMove = await emitWithAck(wrongHouseSock, 'move', 'east');
  console.log('  move into Duskwing Common Room as an Emberclaw student ->', wrongHouseMove.ok, wrongHouseMove.message);
  assert(wrongHouseMove.ok === false && /only/i.test(wrongHouseMove.message ?? ''), 'an Emberclaw student is blocked from entering Duskwing Common Room');
  assert(wrongHouseMove.player.map === 'Grimoak Entrance Hall', 'the blocked move leaves the player in the Entrance Hall');
  wrongHouseSock.close();
  await sleep(300);

  // Own house's Common Room IS allowed — Emberclaw's own west doorway
  // sits at (row 18, col 0), moving 'west' from there attempts the
  // transition into Emberclaw Common Room.
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=18, col=0 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: ownHouseSock, sync: ownHouseSync } = await connectSocket(owner.token);
  console.log('  pre-move sync position ->', ownHouseSync.player.map, ownHouseSync.player.row, ownHouseSync.player.col, 'house:', ownHouseSync.player.house);
  const ownHouseMove = await emitWithAck(ownHouseSock, 'move', 'west');
  console.log('  move into Emberclaw Common Room as an Emberclaw student ->', ownHouseMove.ok, ownHouseMove.message, ownHouseMove.player.map);
  assert(ownHouseMove.ok === true && ownHouseMove.player.map === 'Emberclaw Common Room', 'an Emberclaw student CAN enter Emberclaw Common Room');
  ownHouseSock.close();

  // === Item 11: the Specialization room's chooseSpecialization event ===
  sql(`UPDATE players SET level=1, specialization=NULL WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: lowLevelSock } = await connectSocket(owner.token);
  const lowLevelAck = await emitWithAck(lowLevelSock, 'chooseSpecialization', { path: 'fire' });
  console.log('  chooseSpecialization at level 1 ->', lowLevelAck);
  assert(lowLevelAck.ok === false && /level 10/i.test(lowLevelAck.message ?? ''), 'chooseSpecialization below level 10 is rejected');
  lowLevelSock.close();

  sql(`UPDATE players SET level=10 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: specSock } = await connectSocket(owner.token);
  const specAck = await emitWithAck(specSock, 'chooseSpecialization', { path: 'fire' });
  console.log('  chooseSpecialization(fire) at level 10 ->', specAck);
  assert(specAck.ok === true, 'chooseSpecialization succeeds at level 10');
  const respecAck = await emitWithAck(specSock, 'chooseSpecialization', { path: 'water' });
  console.log('  chooseSpecialization again ->', respecAck);
  assert(respecAck.ok === false && /chosen/i.test(respecAck.message ?? ''), 'choosing a specialization a second time is rejected as already chosen');
  specSock.close();

  owner.socket.close();
  sql(`DELETE FROM players WHERE username = '${owner.charName}';`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
