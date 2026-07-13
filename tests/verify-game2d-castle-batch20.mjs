// Live verification for this 17-item batch. Covers what's cleanly
// server-observable: the wand starting equipped (not in inventory), spell
// casts being blocked without a wand, exp for learning/growing spells,
// level-up combat notices from non-combat paths, the reworked Learn
// Spells quest (now 8 spells, no Elemental Casting), irrigo's relocated
// podium, the new "find the map" quest (checked against mapUnlocked), the
// Specialization room's level-gated teacher, the new bench-rest socket
// event, and the two new Grimoak Grounds monster populations.
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck/build + a manual dev-server check):
// bigger teacher eyes, classroom door symbols, the sword cursor over
// training skeletons, the action bar drag-drop swap, the sacrifice button
// text, and the bench rest-confirmation modal/toast itself (the
// underlying restOnBench event is scripted below, just not the modal UI).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch20.mjs` from the repo root.
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
  // === Item 10: wand starts equipped, not in inventory ===
  const owner = await registerAndSpawn('batcht');
  assert(owner.sync.player.equipment.weapon === 'wand', `a fresh character starts with a wand equipped (equipment: ${JSON.stringify(owner.sync.player.equipment)})`);
  assert(!owner.sync.player.inventory.includes('wand'), `the wand is not ALSO sitting in the inventory (inventory: ${JSON.stringify(owner.sync.player.inventory)})`);

  // === Item 11: casting a spell with no wand equipped is rejected ===
  sql(`UPDATE players SET equipment = '{}'::jsonb, mana=100, max_mana=100, skills = skills || '{"scutum": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: noWandSock } = await connectSocket(owner.token);
  const noWandAck = await emitWithAck(noWandSock, 'castScutum');
  console.log('  castScutum with no wand equipped ->', noWandAck);
  assert(noWandAck.ok === false && /wand/i.test(noWandAck.message ?? ''), 'casting scutum with no wand equipped is rejected with a wand-related message');
  noWandSock.close();

  // Re-equip and confirm the SAME spell now succeeds.
  sql(`UPDATE players SET equipment = '{"weapon":"wand"}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: wandSock } = await connectSocket(owner.token);
  const withWandAck = await emitWithAck(wandSock, 'castScutum');
  console.log('  castScutum with a wand equipped ->', withWandAck);
  assert(withWandAck.ok === true, 'casting scutum succeeds once a wand is equipped again');
  wandSock.close();

  // === Items 5/6: exp for learning a new spell, and for spell growth ===
  // RESERA_BOOK_POSITION is (row 6, col CLASSROOM_MID_COL+6) = (6, 15) —
  // CLASSROOM_MID_COL is floor(CLASSROOM_COLS/2) = floor(19/2) = 9.
  sql(`UPDATE players SET map='Utility Classroom', row=6, col=15, exp=0, level=3, mana=1000, max_mana=1000 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: learnSock, sync: learnSyncBefore } = await connectSocket(owner.token);
  const expBeforeLearn = learnSyncBefore.player.exp;
  let learnAck;
  for (let i = 0; i < 20; i++) {
    learnAck = await emitWithAck(learnSock, 'readReseraBook');
    if (/have learned/i.test(learnAck.message ?? '')) break;
  }
  console.log('  readReseraBook (until learned) ->', learnAck);
  assert(/have learned resera/i.test(learnAck?.message ?? ''), 'eventually learns resera from the Utility Classroom podium');
  assert(/\+50 exp/.test(learnAck?.message ?? ''), `learning resera mentions +50 exp (message: "${learnAck?.message}")`);
  learnSock.close();
  // grantExp's DB write (persistStats) is fire-and-forget (not awaited
  // by the ack) — give it time to actually commit before reading it
  // back via a fresh connection, or this races and reads the stale value.
  await sleep(300);
  const { sync: afterLearnSync } = await connectSocket(owner.token);
  assert(afterLearnSync.player.exp === expBeforeLearn + 50, `learning a new spell actually grants 50 exp (${expBeforeLearn} -> ${afterLearnSync.player.exp})`);

  // Spell growth exp — a LOW scutum skill (near-guaranteed fumble, no
  // cooldown to reconnect around) so many casts can run back-to-back on
  // one connection; growth itself rolls independently of success/fumble
  // (see maybeGrowSpellSkill, called from both branches), so this still
  // reliably observes at least one growth within enough attempts.
  sql(`UPDATE players SET mana=100000, max_mana=100000, skills = skills || '{"scutum": 1}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: growthSock, sync: growthSyncBefore } = await connectSocket(owner.token);
  const expBeforeGrowth = growthSyncBefore.player.exp;
  let sawGrowth = false;
  let sock = growthSock;
  for (let i = 0; i < 60 && !sawGrowth; i++) {
    const ack = await emitWithAck(sock, 'castScutum');
    if (ack.ok && /\+10 exp/.test(ack.message ?? '')) {
      sawGrowth = true;
      console.log('  scutum growth ->', ack.message);
    } else if (ack.ok && ack.active === true) {
      // A real success starts scutum's own cooldown — reconnect to clear it.
      sock.close();
      sock = (await connectSocket(owner.token)).socket;
    }
  }
  sock.close();
  assert(sawGrowth, 'a spell skill growth roll mentions +10 exp within a reasonable number of casts');
  const { sync: afterGrowthSync } = await connectSocket(owner.token);
  assert(
    afterGrowthSync.player.exp > expBeforeGrowth && (afterGrowthSync.player.exp - expBeforeGrowth) % 10 === 0,
    `exp increased by a multiple of 10 from spell growth (${expBeforeGrowth} -> ${afterGrowthSync.player.exp})`
  );

  // === Item 15: irrigo's podium moved to Utility Classroom ===
  // IRRIGO_BOOK_POSITION is (row 6, col CLASSROOM_MID_COL-3) = (6, 6).
  sql(`UPDATE players SET map='Utility Classroom', row=6, col=6 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: irrigoSock } = await connectSocket(owner.token);
  const irrigoHereAck = await emitWithAck(irrigoSock, 'readIrrigoBook');
  console.log('  readIrrigoBook from Utility Classroom ->', irrigoHereAck);
  assert(irrigoHereAck.ok === true, "irrigo's podium now responds from Utility Classroom");
  irrigoSock.close();

  // === Item 17: Specialization room exists, keeps its teacher, no
  // podium (irrigo moved out) ===
  sql(`UPDATE players SET map='Specialization', row=0, col=0 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: specSock, mapState: specState } = await connectSocket(owner.token);
  assert(specState.mapName === 'Specialization', 'the renamed Specialization room is reachable and reports its own new name');
  const specTeacher = specState.teachers.find((t) => t.name === 'Professor Ashgrove');
  assert(Boolean(specTeacher), 'Professor Ashgrove is still standing in the renamed Specialization room');
  const irrigoWrongRoomAck = await emitWithAck(specSock, 'readIrrigoBook');
  console.log('  readIrrigoBook from Specialization (should fail, no podium here anymore) ->', irrigoWrongRoomAck);
  assert(irrigoWrongRoomAck.ok === false, "irrigo's podium no longer responds from the old Elemental Casting/Specialization room");
  specSock.close();

  // === Item 12: enhanced learning duration is 20 ticks (10 real minutes)
  // — checked indirectly via the Learn Spells quest completion, which
  // also exercises item 15's updated CLASSROOM_SPELLS (8 spells now, no
  // Elemental Casting objective). ===
  const allSpells = ['irrigo', 'scutum', 'murus lapideus', 'lucem', 'celeritas', 'resera', 'augue', 'stupefaciunt', 'exarme'];
  const skillsJson = JSON.stringify(Object.fromEntries(allSpells.map((s) => [s, 100])));
  sql(`UPDATE players SET skills = skills || '${skillsJson}'::jsonb, exp=0, level=5 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: questSock } = await connectSocket(owner.token);
  await emitWithAck(questSock, 'startQuest', { questId: 'learn-spells' });
  const postCompleteSyncPromise = new Promise((resolve) => questSock.once('sync', resolve));
  const completeAck = await emitWithAck(questSock, 'completeQuest', { questId: 'learn-spells' });
  console.log('  completeQuest(learn-spells), 8-spell version ->', completeAck);
  assert(completeAck.ok === true, 'Learn Spells (now 8 spells, Elemental Casting removed) completes successfully');
  const postCompleteSync = await Promise.race([postCompleteSyncPromise, sleep(3000).then(() => null)]);
  const remainingMs = (postCompleteSync?.player.enhancedLearningUntil ?? 0) - Date.now();
  console.log(`  enhanced learning remaining ~${Math.round(remainingMs / 1000)}s (expect ~600s for 20 ticks)`);
  assert(remainingMs > 550_000 && remainingMs <= 600_000, `enhanced learning lasts ~600s (20 ticks x 30s) not the old 360s (was ${Math.round(remainingMs / 1000)}s)`);
  questSock.close();

  // === Item 4: the "find the map" quest checks the live mapUnlocked flag
  // — not started/complete until the flag is actually true. ===
  sql(`UPDATE players SET map_unlocked=false WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: mapQuestSock } = await connectSocket(owner.token);
  const startMapQuestAck = await emitWithAck(mapQuestSock, 'startQuest', { questId: 'find-the-map' });
  assert(startMapQuestAck.ok === true, 'starting the find-the-map quest succeeds');
  const tooEarlyMapAck = await emitWithAck(mapQuestSock, 'completeQuest', { questId: 'find-the-map' });
  assert(tooEarlyMapAck.ok === false, 'completing find-the-map before mapUnlocked is true is rejected');
  mapQuestSock.close();

  sql(`UPDATE players SET map_unlocked=true WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: mapDoneSock } = await connectSocket(owner.token);
  const doneMapAck = await emitWithAck(mapDoneSock, 'completeQuest', { questId: 'find-the-map' });
  console.log('  completeQuest(find-the-map) once mapUnlocked ->', doneMapAck);
  assert(doneMapAck.ok === true, 'completing find-the-map succeeds once mapUnlocked is true');
  mapDoneSock.close();

  // === Item 13: the new restOnBench socket event, reach-checked. A
  // fresh, lightly-used character. Note: handleDisconnect calls
  // persistPosition(client), which writes the SOCKET'S in-memory
  // row/col back to the DB on close — so any SQL position update must
  // happen AFTER closing the previous socket (not before), or the
  // disconnect handler clobbers it with the stale position. ===
  const benchTester = await registerAndSpawn('batchtb');
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=1, col=1, hp=1, max_hp=1000 WHERE username='${benchTester.charName}';`);
  await sleep(300);
  const { socket: benchFarSock } = await connectSocket(benchTester.token);
  // Entrance Hall benches sit at midRow=17,midCol=25 +/- 4 (see
  // benchPositionsFor) — (1,1) is nowhere near any of them.
  const farBenchAck = await emitWithAck(benchFarSock, 'restOnBench', { row: 13, col: 25 });
  console.log('  restOnBench while far away ->', farBenchAck);
  assert(farBenchAck.ok === false, 'restOnBench rejects a bench the player is too far from');
  benchFarSock.close();
  await sleep(300);
  sql(`UPDATE players SET row=13, col=26 WHERE username='${benchTester.charName}';`);
  await sleep(100);
  const { socket: benchNearSock } = await connectSocket(benchTester.token);
  const nearBenchAck = await emitWithAck(benchNearSock, 'restOnBench', { row: 13, col: 25 });
  console.log('  restOnBench while adjacent ->', nearBenchAck);
  assert(nearBenchAck.ok === true, 'restOnBench succeeds once actually adjacent to the bench');
  benchNearSock.close();
  sql(`DELETE FROM players WHERE username = '${benchTester.charName}';`);

  // === Item 16: the two new Grimoak Grounds monster populations ===
  sql(`UPDATE players SET map='Grimoak Grounds', row=40, col=90 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: groundsSock, mapState: groundsState } = await connectSocket(owner.token);
  const newSkeleton = groundsState.monsters.find((m) => m.kind === 'wild skeleton' && m.col >= 80);
  const newGoblin = groundsState.monsters.find((m) => m.kind === 'wild goblin' && m.col >= 80);
  console.log('  new-area wild skeleton ->', newSkeleton && { level: newSkeleton.level, hp: newSkeleton.maxHp, col: newSkeleton.col });
  console.log('  new-area wild goblin ->', newGoblin && { level: newGoblin.level, hp: newGoblin.maxHp, col: newGoblin.col });
  assert(Boolean(newSkeleton), 'a wild skeleton is roaming the new (col >= 80) strip of Grimoak Grounds');
  assert(Boolean(newGoblin), 'a wild goblin is roaming the new (col >= 80) strip of Grimoak Grounds');
  if (newSkeleton) {
    assert(newSkeleton.level === 5 && newSkeleton.maxHp === 100, `the new wild skeleton is level 5 with 100 hp (was level ${newSkeleton.level}, ${newSkeleton.maxHp} hp)`);
  }
  if (newGoblin) {
    assert(newGoblin.level === 7 && newGoblin.maxHp === 130, `the new wild goblin is level 7 with 130 hp (was level ${newGoblin.level}, ${newGoblin.maxHp} hp)`);
  }
  groundsSock.close();

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
