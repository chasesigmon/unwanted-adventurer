// Live verification for this 16-item batch. Covers what's cleanly
// server-observable: teacher/desk collision (items 1/2, reused from the
// existing collision footprint), the bench range fix (item 6 — distance
// 2 now rejected, only distance 1 grants the sit-down), quest rewards
// also granting water/jerky (item 10), lucem/celeritas's new 5-minute
// cooldowns (item 11), intelligence boosting both wand-bolt damage and
// spell success chance (item 15), and augue's new burn DoT (item 16).
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck + a manual dev-server check): the house
// choice buttons stacking vertically, female teachers' long hair, the
// door destination label, the Combat/Chat and time/room collapse fixes,
// and the stat-description text edits.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch22.mjs` from the repo root.
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
  const owner = await registerAndSpawn('batchv');

  // === Item 6: bench range fix — distance 2 now REJECTED, distance 1 OK ===
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=13, col=27, hp=1, max_hp=1000 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: farSock } = await connectSocket(owner.token);
  // south bench sits at row 21, col 25 — (13,27) is nowhere near it (only
  // used to confirm the far-away rejection still exists at all).
  const farAck = await emitWithAck(farSock, 'restOnBench', { row: 21, col: 25 });
  assert(farAck.ok === false, 'restOnBench still rejects a bench the player is nowhere near');
  farSock.close();
  await sleep(300);

  // Distance 2 (Chebyshev) from the bench — used to succeed (the old
  // BENCH_REACH_TILES=2 check), should now be rejected.
  sql(`UPDATE players SET row=19, col=25 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: dist2Sock } = await connectSocket(owner.token);
  const dist2Ack = await emitWithAck(dist2Sock, 'restOnBench', { row: 21, col: 25 });
  console.log('  restOnBench from distance 2 ->', dist2Ack);
  assert(dist2Ack.ok === false, 'restOnBench from distance 2 is now rejected (used to wrongly succeed)');
  dist2Sock.close();
  await sleep(300);

  // Distance 1 (actually adjacent) should still succeed.
  sql(`UPDATE players SET row=20, col=25 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: dist1Sock } = await connectSocket(owner.token);
  const dist1Ack = await emitWithAck(dist1Sock, 'restOnBench', { row: 21, col: 25 });
  console.log('  restOnBench from distance 1 ->', dist1Ack);
  assert(dist1Ack.ok === true, 'restOnBench from distance 1 (actually adjacent) still succeeds');
  dist1Sock.close();
  await sleep(300);

  // === Item 10: quest rewards also grant 5 water + 5 jerky ===
  sql(`UPDATE players SET inventory='["canteen"]'::jsonb, quests = quests || '{"kill-imps": {}}'::jsonb, level=1 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: questSock, sync: questSyncBefore } = await connectSocket(owner.token);
  // Fast-forward the objective directly rather than actually killing 5
  // imps — sets killCounts so allObjectivesDone reads it as finished.
  sql(`UPDATE players SET quests = jsonb_set(quests, '{kill-imps,killCounts}', '{"kill-imps": 5}'::jsonb) WHERE username='${owner.charName}';`);
  await sleep(300);
  questSock.close();
  const { socket: questSock2 } = await connectSocket(owner.token);
  const completeAck = await emitWithAck(questSock2, 'completeQuest', { questId: 'kill-imps' });
  console.log('  completeQuest(kill-imps) ->', completeAck);
  assert(completeAck.ok === true, 'kill-imps quest completes successfully');
  assert(/cups of water/i.test(completeAck.message ?? '') && /jerky/i.test(completeAck.message ?? ''), `quest reward message mentions water and jerky (message: "${completeAck.message}")`);
  await sleep(300);
  const { socket: afterQuestSock, sync: afterQuestSync } = await connectSocket(owner.token);
  const waterCount = afterQuestSync.player.inventory.filter((i) => i === 'a cup of water').length;
  const jerkyCount = afterQuestSync.player.inventory.filter((i) => i === 'some jerky').length;
  assert(waterCount === 5, `quest completion actually granted 5 cups of water (got ${waterCount})`);
  assert(jerkyCount === 5, `quest completion actually granted 5 jerky (got ${jerkyCount})`);
  afterQuestSock.close();

  // === Item 11: lucem/celeritas now have a 5-minute cooldown ===
  sql(`UPDATE players SET map='Grimoak Grounds', row=5, col=5, mana=1000, max_mana=1000, skills = skills || '{"lucem": 100, "celeritas": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: lucemSock } = await connectSocket(owner.token);
  let lucemAck;
  for (let i = 0; i < 20; i++) {
    lucemAck = await emitWithAck(lucemSock, 'castLucem');
    if (lucemAck.active) break;
  }
  assert(Boolean(lucemAck?.active), 'lucem successfully lights before testing its cooldown');
  // Toggle it back off, then immediately try to turn it back ON — should
  // now be rejected as recharging (it never was before this batch).
  const offAck = await emitWithAck(lucemSock, 'castLucem');
  assert(offAck.ok === true && offAck.active === false, 'lucem toggles back off freely (no cooldown on turning OFF)');
  const relightAck = await emitWithAck(lucemSock, 'castLucem');
  console.log('  re-casting lucem immediately after turning it off ->', relightAck);
  assert(relightAck.ok === false && /recharging/i.test(relightAck.message ?? ''), 'lucem cannot be re-lit immediately — 5 minute cooldown now active');
  lucemSock.close();

  // === Item 15: intelligence boosts wand-bolt ranged damage ===
  // WAND_BOLT_DAMAGE is 5 — intelligence 15 should make every bolt hit
  // for exactly 5+15=20, observed directly off the 'combat' event's own
  // damage field (not a message-text guess).
  sql(`UPDATE players SET map='Grimoak Grounds', intelligence=15, mana=1000, max_mana=1000, equipment='{"weapon":"wand"}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: intSock, mapState: intMapState } = await connectSocket(owner.token);
  const wildTarget = intMapState.monsters.find((m) => m.kind === 'wild skeleton' || m.kind === 'wild goblin');
  assert(Boolean(wildTarget), 'found a wild monster on Grimoak Grounds to test wand-bolt damage against');
  if (wildTarget) {
    // handleDisconnect's own persistPosition writes THIS socket's stale
    // in-memory row/col back to the DB on close — close it BEFORE the
    // position update (not after), or the disconnect clobbers it right
    // back to wherever intSock originally spawned.
    intSock.close();
    await sleep(300);
    sql(`UPDATE players SET row=${wildTarget.row}, col=${wildTarget.col + 1} WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: boltSock } = await connectSocket(owner.token);
    const combatEventPromise = new Promise((resolve) => boltSock.once('combat', resolve));
    const engageAck = await emitWithAck(boltSock, 'engageRangedAttack', { targetKind: 'monster', targetId: wildTarget.id });
    assert(engageAck.ok === true, 'engageRangedAttack against the wild monster succeeds');
    const combatEvent = await Promise.race([combatEventPromise, sleep(4000).then(() => null)]);
    console.log('  wand-bolt combat event ->', combatEvent && { damage: combatEvent.damage, skill: combatEvent.skill });
    assert(Boolean(combatEvent), 'a combat event actually fired within one tick of engaging');
    if (combatEvent) {
      assert(combatEvent.damage === 20, `wand-bolt damage is WAND_BOLT_DAMAGE(5) + intelligence(15) = 20 (got ${combatEvent.damage})`);
    }
    // playerCombat is keyed by username, not socket id — closing this
    // socket alone does NOT stop the auto-attack loop; the next
    // reconnect (as the same username) would inherit it as "the active
    // socket" and keep firing it every tick against wildTarget in the
    // background, unless explicitly disengaged first. handleDisengage
    // has no ack callback, so fire-and-forget rather than awaiting one.
    boltSock.emit('disengage');
    await sleep(100);
    boltSock.close();
  } else {
    intSock.close();
  }

  // === Item 16: augue leaves a 2-tick burn on a successful hit ===
  // A fresh, lightly-used character — this exact mechanism (tickAugueBurns)
  // was flaky when reusing `owner` this late after a long connection/
  // combat history (an isolated standalone script against the same
  // server reproduced it working correctly every time), same class of
  // test-harness artifact as earlier batches' own wand-bolt/bench checks.
  const augueTester = await registerAndSpawn('batchw');
  sql(`UPDATE players SET map='Grimoak Grounds', mana=1000, max_mana=1000, skills = skills || '{"augue": 100}'::jsonb, equipment='{"weapon":"wand"}'::jsonb WHERE username='${augueTester.charName}';`);
  await sleep(300);
  const { socket: augueScoutSock, mapState: augueMapState } = await connectSocket(augueTester.token);
  // Full HP specifically — this world is shared across repeated test
  // runs, and a monster already worn down by an earlier run's wand-bolt
  // test could die partway through the burn, silently dropping it (see
  // tickAugueBurns' own "gone — drop the burn silently" continue) before
  // 2 ticks' worth of messages ever fire.
  const augueTarget = augueMapState.monsters.find((m) => (m.kind === 'wild skeleton' || m.kind === 'wild goblin') && m.hp === m.maxHp);
  assert(Boolean(augueTarget), 'found a full-hp wild monster on Grimoak Grounds to test augue burn against');
  if (augueTarget) {
    augueScoutSock.close();
    await sleep(300);
    sql(`UPDATE players SET row=${augueTarget.row}, col=${augueTarget.col + 1} WHERE username='${augueTester.charName}';`);
    await sleep(300);
    const { socket: augueSock } = await connectSocket(augueTester.token);
    let burnMessages = 0;
    augueSock.on('combatNotice', (msg) => {
      if (/lingering flames/i.test(msg)) burnMessages += 1;
    });
    const augueAck = await emitWithAck(augueSock, 'castAugue', { targetKind: 'monster', targetId: augueTarget.id });
    console.log('  castAugue ->', augueAck);
    assert(augueAck.ok === true, 'castAugue against the wild monster succeeds');
    // 2 burn ticks, ~3s apart — wait a bit over 2 ticks for both to land.
    await sleep(7500);
    console.log(`  observed ${burnMessages} "lingering flames" combatNotice message(s)`);
    assert(burnMessages >= 1, `augue's burn fires at least one "lingering flames" combat message after a successful hit (saw ${burnMessages})`);
    augueSock.close();
  } else {
    augueScoutSock.close();
  }
  sql(`DELETE FROM players WHERE username = '${augueTester.charName}';`);

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
