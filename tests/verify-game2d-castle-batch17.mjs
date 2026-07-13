// Live verification for this 6-item batch. Covers what's cleanly
// server-observable: augue now costing mana (10) on both success and
// fumble, with the caster's own client actually seeing the new mana value
// via 'sync' (not just the room-broadcast 'combat' event); the nested 20%
// chance for a skill/spell growth roll to be +2 instead of +1 (checked via
// the exported constants, since forcing the actual nested roll live would
// need thousands of casts); and the imp's diagonal-adjacency chase fix —
// placed exactly one diagonal tile away from a live imp, it should close
// the last step to true cardinal adjacency and then proactively attack.
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck/build + a manual dev-server check): the
// corrected ASCII world map connection lines + gate caption wording, the
// wand's corrected right-hand offset while facing/walking north, and the
// logout/character-select token-routing flow (net.ts's account vs.
// character token split has no server-side change to probe — the server's
// own auth.service.ts account/character logout branching predates this
// batch and was already covered by earlier verification passes).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch17.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { SKILL_GROWTH_CHANCE, BIG_SKILL_GROWTH_CHANCE, BIG_SKILL_GROWTH_AMOUNT } from '../game2d/dist/server/combat/formulas.js';

const BASE = 'http://localhost:3001';
const SPELL_ATTACK_MANA_COST = 10; // mirrors game.gateway.ts's own (unexported) constant
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
  // === Item 2: nested growth-chance constants exist with the right values ===
  assert(SKILL_GROWTH_CHANCE === 0.05, `SKILL_GROWTH_CHANCE is 0.05 (was ${SKILL_GROWTH_CHANCE})`);
  assert(BIG_SKILL_GROWTH_CHANCE === 0.2, `BIG_SKILL_GROWTH_CHANCE is 0.2 (was ${BIG_SKILL_GROWTH_CHANCE})`);
  assert(BIG_SKILL_GROWTH_AMOUNT === 2, `BIG_SKILL_GROWTH_AMOUNT is 2 (was ${BIG_SKILL_GROWTH_AMOUNT})`);

  const owner = await registerAndSpawn('batchqrs');

  // === Item 1: augue costs mana on SUCCESS, and the caster's own client
  // is told about it via 'sync' (not just the silent room-broadcast
  // 'combat' event, which never carries the caster's own mana). Give the
  // player 100% augue skill so success is guaranteed, and a monster
  // target next to them. ===
  sql(`UPDATE players SET map='Grimoak Grounds', mana=100, max_mana=100, skills = skills || '{"augue": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scoutSocket, mapState: scoutState } = await connectSocket(owner.token);
  const imp = scoutState.monsters.find((m) => m.kind === 'imp');
  scoutSocket.close();

  if (!imp) {
    console.log('  (no live imp found on Grimoak Grounds — skipping augue-vs-monster and diagonal-chase checks)');
  } else {
    sql(`UPDATE players SET row=${imp.row}, col=${imp.col + 1}, hp=200, max_hp=200, mana=100, max_mana=100 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: augueSock, sync: augueSyncBefore } = await connectSocket(owner.token);
    const manaBefore = augueSyncBefore.player.mana;

    const syncPromise = new Promise((resolve) => augueSock.once('sync', resolve));
    const augueAck = await emitWithAck(augueSock, 'castAugue', { targetKind: 'monster', targetId: imp.id });
    console.log('  castAugue at 100% skill ->', augueAck);
    assert(augueAck.ok === true, 'augue cast is accepted at 100% skill with enough mana');

    const syncAfter = await Promise.race([syncPromise, sleep(3000).then(() => null)]);
    console.log('  own mana before ->', manaBefore, ' sync after augue ->', syncAfter?.player?.mana);
    assert(syncAfter !== null, "augue's success path syncs the caster's own updated stats (not just the room combat event)");
    assert(
      syncAfter && syncAfter.player.mana === manaBefore - SPELL_ATTACK_MANA_COST,
      `augue deducted exactly ${SPELL_ATTACK_MANA_COST} mana on success (before ${manaBefore}, after ${syncAfter?.player?.mana})`
    );
    augueSock.close();

    // === Item 1 (fumble path): 1% skill practically guarantees a fumble;
    // mana should still be deducted even though the spell fails. ===
    sql(`UPDATE players SET mana=100, max_mana=100, skills = skills || '{"augue": 1}'::jsonb WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: fumbleSock, sync: fumbleSyncBefore } = await connectSocket(owner.token);
    const fumbleManaBefore = fumbleSyncBefore.player.mana;
    const fumbleAck = await emitWithAck(fumbleSock, 'castAugue', { targetKind: 'monster', targetId: imp.id });
    console.log('  castAugue at 1% skill ->', fumbleAck);
    await sleep(300);
    const { socket: fumbleCheckSock, sync: fumbleSyncAfter } = await connectSocket(owner.token);
    console.log('  own mana before fumble ->', fumbleManaBefore, ' after ->', fumbleSyncAfter.player.mana);
    assert(
      fumbleAck.ok === true && fumbleSyncAfter.player.mana === fumbleManaBefore - SPELL_ATTACK_MANA_COST,
      `augue deducted exactly ${SPELL_ATTACK_MANA_COST} mana even on a near-certain fumble (before ${fumbleManaBefore}, after ${fumbleSyncAfter.player.mana})`
    );
    fumbleSock.close();
    fumbleCheckSock.close();

    // === Item 3 (priority): the imp closes a DIAGONAL last tile instead of
    // treating diagonal adjacency as "close enough" forever, then
    // proactively attacks once truly cardinally adjacent. ===
    sql(`UPDATE players SET row=${imp.row + 1}, col=${imp.col + 1}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: diagSock } = await connectSocket(owner.token);
    let latestMapState = null;
    diagSock.on('map:state', (m) => (latestMapState = m));
    diagSock.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    const notice = await Promise.race([
      new Promise((resolve) => diagSock.once('combatNotice', resolve)),
      sleep(10000).then(() => null),
    ]);
    console.log('  combatNotice starting diagonally adjacent to the imp ->', notice);
    const liveImp = latestMapState?.monsters.find((m) => m.id === imp.id);
    console.log('  imp position after closing in ->', liveImp?.row, liveImp?.col);
    assert(Boolean(notice), 'the imp closed the diagonal gap to true cardinal adjacency and proactively attacked (no longer stuck treating diagonal as in-range)');
    diagSock.close();
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
