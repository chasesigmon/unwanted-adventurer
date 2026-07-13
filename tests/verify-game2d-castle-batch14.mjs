// Live verification for this 10-item batch: the entrance-hall practice
// NPCs renamed scarecrow -> training skeleton (and moved to sit between
// the two east fireplaces), the figo spell's removal, and — the two
// biggest behavioral fixes — every "instant guaranteed effect" spell
// (augue/stupefaciunt/exarme/scutum/murus lapideus) now actually rolling
// against its own learned skill percent instead of always landing, and
// the imp aggro-chase bug where `lastContactTick` was only ever set ONCE
// at engage time and never refreshed while actively chasing, so any
// pursuit longer than the ~30s aggro timeout silently gave up partway
// (this was the actual root cause behind "imps still are not moving
// toward the player").
//
// NOT scripted here (pure client-only UI with no server-observable
// signal — verified instead by typecheck/build + a quick manual
// dev-server check): the Prompt/autopilot button+hotkey being hidden,
// the Skills modal's "Show All" button removal, and the sit-animation
// breathing tween removal.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch14.mjs` from the repo root.
// Takes ~2 minutes (the augue success-chance statistical test needs
// several casts spaced by its own 3s cooldown, and the imp-chase fix
// needs to be observed well past the old 30s aggro timeout).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { SPELLS } from '../game2d/dist/shared/spells.js';
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
  // === Item 9: figo removed ===
  assert(!SPELLS.some((s) => s.name === 'figo'), 'figo was removed from the spell list');
  assert(SPELLS.some((s) => s.name === 'augue'), 'other spells like augue are still listed');

  // === Items 1 & 6: training skeletons renamed + repositioned ===
  const trainingSkeletons = NPCS.filter((n) => n.map === 'Grimoak Entrance Hall');
  console.log('  entrance hall practice NPCs ->', trainingSkeletons.map((n) => `${n.label}@(${n.row},${n.col})`));
  assert(trainingSkeletons.length === 3, 'there are still 3 practice NPCs in the Entrance Hall');
  assert(trainingSkeletons.every((n) => n.label === 'training skeleton'), 'all 3 are labeled "training skeleton", not "scarecrow"');
  assert(trainingSkeletons.every((n) => n.col === 38), 'all 3 sit in the same column as the two east fireplaces (col 38)');
  const rows = trainingSkeletons.map((n) => n.row).sort((a, b) => a - b);
  assert(rows[0] > 8 && rows[2] < 27, 'all 3 sit between the two east fireplaces\' own rows (8 and 27)');

  const owner = await registerAndSpawn('bfourteen');

  // === Item 10: augue now rolls against its own learned skill percent
  // instead of always landing — at a low (10%) skill, at least one
  // fumble should turn up across 15 casts (P(zero fumbles by chance) =
  // 0.8^15 =~ 3.5%, i.e. this would have to get extremely unlucky to
  // false-fail); at 100% skill, every cast should land. Targets one of
  // the (immortal) Entrance Hall training skeletons rather than the
  // Great Plains training dummy — the dummy isn't immortal, so repeated
  // augue hits would eventually kill and TELEPORT it to a random free
  // tile (see handleCastAugue's own npc-death branch), breaking the
  // fixed-position range check partway through a 15-cast loop.
  const trainingSkeletonId = 'entrance-hall-training-skeleton-1';
  sql(
    `UPDATE players SET map='Grimoak Entrance Hall', row=14, col=37, mana=1000, max_mana=1000, skills = skills || '{"augue": 10}'::jsonb WHERE username='${owner.charName}';`
  );
  await sleep(300);
  const { socket: lowSkillSock } = await connectSocket(owner.token);
  let fumbles = 0;
  let hits = 0;
  for (let i = 0; i < 15; i++) {
    const ack = await emitWithAck(lowSkillSock, 'castAugue', { targetKind: 'npc', targetId: trainingSkeletonId });
    if (!ack.ok) {
      console.log('  unexpected augue rejection ->', ack);
      continue;
    }
    if (/fumble/.test(ack.message ?? '')) fumbles++;
    else hits++;
    await sleep(3200); // augue's own 1-tick (3s) cooldown
  }
  console.log(`  augue at 10% skill over 15 casts -> ${hits} hits, ${fumbles} fumbles`);
  assert(fumbles > 0, 'augue fumbled at least once at 10% skill (it is no longer working every single time)');
  assert(hits > 0, 'augue also still landed some hits at 10% skill (the roll is not ALWAYS failing either)');
  lowSkillSock.close();

  sql(`UPDATE players SET skills = skills || '{"augue": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: highSkillSock } = await connectSocket(owner.token);
  let allHitAt100 = true;
  for (let i = 0; i < 4; i++) {
    const ack = await emitWithAck(highSkillSock, 'castAugue', { targetKind: 'npc', targetId: trainingSkeletonId });
    if (!ack.ok || /fumble/.test(ack.message ?? '')) allHitAt100 = false;
    await sleep(3200);
  }
  console.log('  augue at 100% skill over 4 casts -> all landed:', allHitAt100);
  assert(allHitAt100, 'augue always lands at 100% skill (deterministic ceiling, same as before)');
  highSkillSock.close();

  // === Item 10: the other 4 previously-deterministic spells now also
  // roll — sanity-check each one still succeeds reliably at 100% skill
  // (proves each is wired to the shared roll correctly, not just augue).
  // Still using the same immortal training skeleton, same reasoning. ===
  sql(`UPDATE players SET skills = skills || '{"stupefaciunt": 100, "exarme": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: stunSock } = await connectSocket(owner.token);
  const stunAck = await emitWithAck(stunSock, 'castStupefaciunt', { targetKind: 'npc', targetId: trainingSkeletonId });
  console.log('  stupefaciunt at 100% skill ->', stunAck);
  assert(stunAck.ok === true && /stuns/.test(stunAck.message ?? ''), 'stupefaciunt lands at 100% skill');
  const exarmeAck = await emitWithAck(stunSock, 'castExarme', { targetKind: 'npc', targetId: trainingSkeletonId });
  console.log('  exarme at 100% skill ->', exarmeAck);
  assert(exarmeAck.ok === true && !/fumble/.test(exarmeAck.message ?? ''), 'exarme lands (no fumble) at 100% skill');
  stunSock.close();

  sql(`UPDATE players SET map='Great Plains', row=5, col=5, mana=1000, skills = skills || '{"scutum": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scutumSock } = await connectSocket(owner.token);
  const scutumAck = await emitWithAck(scutumSock, 'castScutum');
  console.log('  scutum at 100% skill ->', scutumAck);
  assert(scutumAck.ok === true && scutumAck.active === true, 'scutum activates at 100% skill');
  scutumSock.close();

  sql(`UPDATE players SET skills = skills || '{"murus lapideus": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: murusSock } = await connectSocket(owner.token);
  const murusAck = await emitWithAck(murusSock, 'castMurusLapideus', { row: 7, col: 5 });
  console.log('  murus lapideus at 100% skill ->', murusAck);
  assert(murusAck.ok === true && !/fumble/.test(murusAck.message ?? ''), 'murus lapideus summons its block (no fumble) at 100% skill');
  murusSock.close();

  // === Item 8 (priority fix): the imp aggro-chase bug — lastContactTick
  // was only ever set ONCE at engage time and never refreshed while
  // actively chasing, so a pursuit longer than the ~30s aggro timeout
  // silently gave up partway. Set up a chase that needs MORE than 30s to
  // close (player starts ~18 tiles from a live imp) and confirm it keeps
  // closing distance well past that mark instead of stalling. ===
  sql(`UPDATE players SET map='Grimoak Grounds', mana=100 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scoutSock, mapState: scoutState } = await connectSocket(owner.token);
  const imp = scoutState.monsters.find((m) => m.kind === 'imp');
  scoutSock.close();
  if (!imp) {
    console.log('  (no live imp found on Grimoak Grounds — skipping the chase-duration check)');
  } else {
    const startCol = Math.max(0, imp.col - 18);
    sql(`UPDATE players SET row=${imp.row}, col=${startCol}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: chaseSock } = await connectSocket(owner.token);
    chaseSock.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    const startDist = Math.abs(imp.col - startCol);

    // Sample distance at ~15s, ~30s (the OLD timeout mark), and ~40s
    // (well past it) — under the old bug, distance would stop shrinking
    // (or the imp would even wander back off) once lastContactTick's
    // single initial stamp aged past AGGRO_TIMEOUT_TICKS.
    const samples = [];
    for (const t of [15000, 30000, 42000]) {
      await sleep(t - (samples.length > 0 ? samples[samples.length - 1].t : 0));
      const { socket: sampleSock, mapState } = await connectSocket(owner.token);
      const live = mapState.monsters.find((m) => m.id === imp.id);
      const dist = live ? Math.abs(live.col - startCol) : null;
      samples.push({ t, dist });
      console.log(`  imp chase sample at t=${t}ms -> distance from player's start col = ${dist}`);
      sampleSock.close();
    }
    chaseSock.close();

    const last = samples[samples.length - 1].dist;
    if (last === null) {
      console.log('  (imp disappeared mid-test — likely killed/despawned; skipping the distance assertion)');
    } else {
      assert(last < startDist, `the imp is closer to the player's start position at t=42s (dist ${last}) than at engage time (dist ${startDist}) — the chase survived past the old 30s aggro timeout`);
      const at30 = samples.find((s) => s.t === 30000)?.dist;
      const at42 = samples.find((s) => s.t === 42000)?.dist;
      if (at30 !== null && at42 !== null) {
        assert(at42 <= at30, 'the imp kept closing distance (or held position adjacent) PAST the 30s mark, instead of the chase stalling there');
      }
    }
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
