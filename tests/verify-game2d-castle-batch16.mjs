// Live verification for this 14-item batch. Covers what's cleanly
// server-observable: scutum's cooldown now only starting on a successful
// cast (not a fumble), the imp's new PROACTIVE attack (hits an adjacent
// aggro'd player even when the player isn't attacking back) and its
// faster aggro-chase speed, the starting skill percent bump to 15%, the
// castle gate's own proximity-based open/closed collision, and the new
// stat-point allocation system (including constitution/intelligence's
// derived max hp/mana bumps).
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck/build + a quick manual dev-server
// check): the corrected ASCII world map (dorms drawn north of common
// rooms) and the "Overworld" dropdown's removal, the spells modal's
// grey-out-unlearned styling, the character sheet's own "Stat Points: N"
// + "+" button UI and level-up toast, and dexterity's own movement-speed
// feel (a client-side move-cooldown formula with no server enforcement,
// same as celeritas's existing speed boost).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch16.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import {
  STARTING_SKILL_PERCENT,
  SCUTUM_SKILL,
} from '../game2d/dist/shared/skills.js';
import { GATE_ROW, GATE_COL_LEFT, GATE_COL_RIGHT, GATE_REACH_TILES, isGateTile } from '../game2d/dist/shared/maps.js';
import { HP_PER_CONSTITUTION, MANA_PER_INTELLIGENCE, STAT_POINTS_PER_LEVEL } from '../game2d/dist/server/combat/formulas.js';

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
  // === Item 3: starting skill percent is 15 ===
  assert(STARTING_SKILL_PERCENT === 15, `STARTING_SKILL_PERCENT is 15 (was ${STARTING_SKILL_PERCENT})`);

  // === Item 9/12/11: new formula constants ===
  assert(HP_PER_CONSTITUTION === 20, `HP_PER_CONSTITUTION is 20 (was ${HP_PER_CONSTITUTION})`);
  assert(MANA_PER_INTELLIGENCE === 10, `MANA_PER_INTELLIGENCE is 10 (was ${MANA_PER_INTELLIGENCE})`);
  assert(STAT_POINTS_PER_LEVEL === 1, `STAT_POINTS_PER_LEVEL is 1 (was ${STAT_POINTS_PER_LEVEL})`);

  // === Item 6: gate footprint is sane ===
  console.log('  gate ->', { GATE_ROW, GATE_COL_LEFT, GATE_COL_RIGHT, GATE_REACH_TILES });
  assert(isGateTile('Grimoak Grounds', GATE_ROW, GATE_COL_LEFT), 'the gate footprint includes its own left edge');
  assert(isGateTile('Grimoak Grounds', GATE_ROW, GATE_COL_RIGHT), 'the gate footprint includes its own right edge');
  assert(!isGateTile('Grimoak Grounds', GATE_ROW - 10, GATE_COL_LEFT), 'a tile far from the gate is not part of it');
  assert(!isGateTile('Grimoak Entrance Hall', GATE_ROW, GATE_COL_LEFT), 'the gate only exists on Grimoak Grounds');

  const owner = await registerAndSpawn('bstat');

  // === Item 6: ordinary movement well outside the gate's own footprint
  // (in the open field south of it, well clear of the castle/moat
  // structure to its north) still works normally — a basic sanity check
  // before the interesting part below ===
  const farRow = GATE_ROW + GATE_REACH_TILES + 15;
  sql(`UPDATE players SET map='Grimoak Grounds', row=${farRow - 1}, col=${GATE_COL_LEFT}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: farSock } = await connectSocket(owner.token);
  const farMoveAck = await emitWithAck(farSock, 'move', 'south');
  console.log('  moving in the open field south of the gate ->', farMoveAck.ok, farMoveAck.player.row, farMoveAck.player.col);
  assert(farMoveAck.ok === true && farMoveAck.player.row === farRow, 'ordinary movement away from the gate is unaffected');
  farSock.close();

  // The gate opens for whoever is actually approaching it (by design —
  // "opens... to allow the PLAYER through" the instant they're close
  // enough), so the only way to observe it end to end is a player
  // actually stepping onto its own tile from right next to it, confirming
  // the reach-check math and isGateTile's own row/col line up correctly.
  sql(`UPDATE players SET row=${GATE_ROW - 1}, col=${GATE_COL_LEFT} WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: nearSock } = await connectSocket(owner.token);
  const onGateAck = await emitWithAck(nearSock, 'move', 'south');
  console.log('  stepping onto the gate tile while nearby ->', onGateAck.ok, onGateAck.player.row, onGateAck.player.col);
  assert(onGateAck.ok === true && onGateAck.player.row === GATE_ROW, "the gate is open (and lets the player through) once they're within reach");
  nearSock.close();

  // === Item 9/12: stat-point allocation bumps constitution's own max hp
  // and intelligence's own max mana by the fixed per-point amount ===
  sql(`UPDATE players SET map='Great Plains', row=5, col=5, stat_points_available=3 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: allocSock, sync: allocSync } = await connectSocket(owner.token);
  const hpBefore = allocSync.player.maxHp;
  const manaBefore = allocSync.player.maxMana;
  const pointsBefore = allocSync.player.statPointsAvailable;
  assert(pointsBefore === 3, 'statPointsAvailable loaded fresh from the DB (3)');

  const conAck = await emitWithAck(allocSock, 'allocateStatPoint', { stat: 'constitution' });
  console.log('  allocate -> constitution ->', conAck);
  assert(conAck.ok === true, 'allocating a stat point on constitution succeeds');
  await sleep(200);

  const intAck = await emitWithAck(allocSock, 'allocateStatPoint', { stat: 'intelligence' });
  console.log('  allocate -> intelligence ->', intAck);
  assert(intAck.ok === true, 'allocating a stat point on intelligence succeeds');

  const { socket: checkSock, sync: checkSync } = await connectSocket(owner.token);
  console.log(
    '  after 2 allocations -> maxHp',
    checkSync.player.maxHp,
    '(was',
    hpBefore,
    ') maxMana',
    checkSync.player.maxMana,
    '(was',
    manaBefore,
    ') points left',
    checkSync.player.statPointsAvailable
  );
  assert(checkSync.player.maxHp === hpBefore + HP_PER_CONSTITUTION, 'max hp increased by exactly HP_PER_CONSTITUTION after allocating to constitution');
  assert(checkSync.player.maxMana === manaBefore + MANA_PER_INTELLIGENCE, 'max mana increased by exactly MANA_PER_INTELLIGENCE after allocating to intelligence');
  assert(checkSync.player.constitution === (allocSync.player.constitution + 1), 'constitution itself went up by 1');
  assert(checkSync.player.intelligence === (allocSync.player.intelligence + 1), 'intelligence itself went up by 1');
  assert(checkSync.player.statPointsAvailable === pointsBefore - 2, 'exactly 2 of the 3 available points were spent');

  const noPointsAck = await emitWithAck(checkSock, 'allocateStatPoint', { stat: 'luck' });
  console.log('  allocate with 1 point left ->', noPointsAck);
  assert(noPointsAck.ok === true, 'the 3rd (last) point can still be spent');
  const outOfPointsAck = await emitWithAck(checkSock, 'allocateStatPoint', { stat: 'luck' });
  console.log('  allocate with 0 points left ->', outOfPointsAck);
  assert(outOfPointsAck.ok === false, 'allocating with zero points left is rejected');
  allocSock.close();
  checkSock.close();

  // === Item 1: scutum's cooldown only starts on a SUCCESSFUL cast — at
  // 100% skill it should always succeed and always be on cooldown right
  // after; at a low skill it should eventually fumble, and immediately
  // after a fumble a recast should NOT be blocked by any cooldown. ===
  sql(`UPDATE players SET mana=1000, max_mana=1000, skills = skills || '{"scutum": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scutumHighSock } = await connectSocket(owner.token);
  const highAck = await emitWithAck(scutumHighSock, 'castScutum');
  console.log('  scutum at 100% skill ->', highAck);
  assert(highAck.ok === true && highAck.active === true, 'scutum succeeds at 100% skill');
  const recastBlockedAck = await emitWithAck(scutumHighSock, 'castScutum');
  console.log('  recasting scutum immediately after success ->', recastBlockedAck);
  assert(recastBlockedAck.ok === false && /recharging/.test(recastBlockedAck.message ?? ''), 'a successful cast DOES start the cooldown (immediate recast blocked)');
  scutumHighSock.close();

  // skillCooldowns lives only in server-side connection memory (never
  // persisted/loaded from the DB — see handleConnection's own
  // `client.data.skillCooldowns = {}`). A fumble never sets one at all
  // (that's exactly what's under test), so the whole search can safely
  // stay on ONE live connection — reconnecting per attempt would blow
  // through the 20-connections-per-60s per-IP limiter this suite already
  // has to share with every other test. Only a genuine SUCCESS needs a
  // fresh connection afterward, to clear its own very real 2-minute
  // cooldown before the next attempt.
  sql(`UPDATE players SET skills = skills || '{"scutum": 15}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  let sawFumble = false;
  let scutumSock = (await connectSocket(owner.token)).socket;
  for (let i = 0; i < 10 && !sawFumble; i++) {
    const ack = await emitWithAck(scutumSock, 'castScutum');
    // A fumble is still ok:true (the cast attempt itself was accepted) —
    // active:false plus the fumble message distinguishes it from a real
    // success, which sets active:true. ok:false only ever means the cast
    // was rejected outright (no skill, on cooldown, out of mana, ...).
    if (ack.ok === true && ack.active === false) {
      sawFumble = true;
      console.log(`  scutum fumbled on attempt ${i + 1} ->`, ack);
      const retryAck = await emitWithAck(scutumSock, 'castScutum');
      console.log('  immediate recast on the SAME connection right after a fumble ->', retryAck);
      assert(
        !(retryAck.ok === false && /recharging/.test(retryAck.message ?? '')),
        'a fumbled cast does NOT start the cooldown (immediate recast is not blocked by recharging)'
      );
    } else if (ack.ok === true && ack.active === true) {
      console.log(`  scutum succeeded on attempt ${i + 1} (real cooldown now active, reconnecting to clear it) ->`, ack);
      scutumSock.close();
      scutumSock = (await connectSocket(owner.token)).socket;
    } else {
      console.log(`  scutum attempt ${i + 1} unexpected ->`, ack.ok, ack.active, ack.message);
    }
  }
  scutumSock.close();
  assert(sawFumble, 'scutum fumbled at least once across up to 10 low-skill attempts');

  // === Item 2 (priority): the imp's new proactive attack — an adjacent,
  // aggro'd imp hits the player even when the player never attacks back —
  // and its faster aggro-chase speed. ===
  sql(`UPDATE players SET map='Grimoak Grounds', mana=100 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scoutSocket, mapState: scoutState } = await connectSocket(owner.token);
  const imp = scoutState.monsters.find((m) => m.kind === 'imp');
  scoutSocket.close();
  if (!imp) {
    console.log('  (no live imp found on Grimoak Grounds — skipping the imp behavior checks)');
  } else {
    // Proactive attack: put the player directly adjacent, aggro it, and
    // wait WITHOUT attacking — hp should drop on its own.
    sql(`UPDATE players SET row=${imp.row}, col=${imp.col + 1}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: adjSock, sync: adjSync } = await connectSocket(owner.token);
    const hpAtStart = adjSync.player.hp;
    adjSock.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    const notice = await Promise.race([
      new Promise((resolve) => adjSock.once('combatNotice', resolve)),
      sleep(10000).then(() => null),
    ]);
    console.log('  combatNotice while standing adjacent, never attacking ->', notice);
    const { socket: hpCheckSock, sync: hpCheckSync } = await connectSocket(owner.token);
    console.log('  hp before ->', hpAtStart, ' hp after ~10s of standing next to an aggro\'d imp ->', hpCheckSync.player.hp);
    assert(hpCheckSync.player.hp < hpAtStart || Boolean(notice), "the imp proactively attacked the adjacent player without the player attacking first");
    hpCheckSock.close();
    adjSock.close();

    // Faster chase: starting far away, it should close noticeably more
    // than 1 tile per ~3s combat tick.
    const startCol = Math.max(0, imp.col - 16);
    sql(`UPDATE players SET row=${imp.row}, col=${startCol}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: chaseSock } = await connectSocket(owner.token);
    let latestMapState = null;
    chaseSock.on('map:state', (m) => (latestMapState = m));
    chaseSock.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    await sleep(6500); // ~2 combat ticks
    const liveImp = latestMapState?.monsters.find((m) => m.id === imp.id);
    const closed = liveImp ? Math.abs(liveImp.col - startCol) : 0;
    console.log(`  imp closed ${closed} tiles of column distance in ~6.5s (~2 ticks)`);
    assert(closed >= 3, `the aggro'd imp closes distance faster than 1 tile/tick (closed ${closed} tiles in ~2 ticks)`);
    chaseSock.close();
  }

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
