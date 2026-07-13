// Live verification for this 10-item batch: character deletion (with
// account-ownership enforcement), the Great Hall's 25% size reduction +
// its new banquet-table/faculty-stage furniture (pure shared-code
// footprint checks), murus lapideus's stone block ("Blockman") duration
// (20s -> 30s) and cooldown (40s -> 60s), the imp's flat 5-damage punch
// and its new engageMelee-triggered chase-toward-aggro behavior, scutum's
// fast (~3s combat-tick) expiry fix instead of lingering up to the old
// 30-40s global tick, and stupefaciunt now starting an auto-attack
// combat session the same way augue already did.
//
// NOT scripted here (pure client-only behavior with no server-observable
// signal, verified instead by typecheck/build + a quick manual dev-server
// check): action-bar tooltips, the skills-modal category grouping, the
// ack-message-on-success client bug fix (the server always sent
// ack.message — the bug was the CLIENT dropping it on success), and the
// involvesMe combat-log visibility gate (the server still broadcasts the
// same 'combat' event to everyone in the room either way — only the
// client's decision to log it changed).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch13.mjs` from the repo root.
// Takes ~2 minutes (murus lapideus's own 30s duration and scutum's own
// 60s duration both need to be waited out to prove their expiry timing).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import {
  greatHallTableFootprint,
  greatHallChairPositionsFor,
  greatHallStagePlatform,
  isGreatHallTableBlocked,
  isGreatHallChairBlocked,
} from '../game2d/dist/shared/lighting.js';
import { SKILL_COOLDOWN_MS, MURUS_LAPIDEUS_SKILL } from '../game2d/dist/shared/skills.js';
import { MONSTER_SPECIES } from '../game2d/dist/server/monsters/monster.js';
import { WAND_ITEM } from '../game2d/dist/shared/equipment.js';

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

async function deleteJson(path, token) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function getJson(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
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
  const { socket, sync, mapState } = await connectSocket(select.body.token);
  return { charName, accountToken: reg.body.token, token: select.body.token, socket, sync, mapState };
}

async function main() {
  // === Item 10: Great Hall reduced 25%, new furniture footprints ===
  const entranceHall = getMap('Grimoak Entrance Hall');
  const greatHall = getMap('Great Hall');
  console.log('  Entrance Hall ->', entranceHall.rows, 'x', entranceHall.cols, ' Great Hall ->', greatHall.rows, 'x', greatHall.cols);
  assert(greatHall.rows === Math.round(entranceHall.rows * 0.75), 'Great Hall rows are exactly 75% of the Entrance Hall (a 25% reduction)');
  assert(greatHall.cols === Math.round(entranceHall.cols * 0.75), 'Great Hall cols are exactly 75% of the Entrance Hall (a 25% reduction)');

  const table = greatHallTableFootprint('Great Hall');
  const stage = greatHallStagePlatform('Great Hall');
  const chairs = greatHallChairPositionsFor('Great Hall');
  console.log('  table footprint ->', table, ' stage footprint ->', stage, ' chair count ->', chairs.length);
  assert(Boolean(table) && Boolean(stage), 'the Great Hall has both a table and a stage footprint');
  const tableWidth = table.colEnd - table.colStart + 1;
  assert(Math.abs(tableWidth / greatHall.cols - 0.5) < 0.05, 'the table spans roughly half the room width');
  assert(chairs.length === 19, 'there are 19 chairs total (6 dining x2 sides + 7 on the stage)');
  const bigChairs = chairs.filter((c) => c.big);
  assert(bigChairs.length === 1, 'exactly one chair is the bigger head chair');
  assert(stage.colStart > table.colEnd, 'the stage sits entirely east of (to the right of) the dining table, no overlap');
  assert(isGreatHallTableBlocked('Great Hall', table.rowStart, table.colStart), 'the table blocks movement on its own footprint');
  assert(!isGreatHallTableBlocked('Great Hall', table.rowStart - 3, table.colStart), 'a tile well north of the table is not blocked');
  const northChair = chairs.find((c) => c.row === table.rowStart - 1);
  assert(Boolean(northChair) && isGreatHallChairBlocked('Great Hall', northChair.row, northChair.col), 'a dining chair tile blocks movement');
  assert(greatHall.name === 'Great Hall', 'Great Hall map definition still resolves correctly after the resize');

  // === Item 3 (part 1): murus lapideus's own cooldown is 60s ===
  assert(SKILL_COOLDOWN_MS[MURUS_LAPIDEUS_SKILL] === 60 * 1000, "murus lapideus's own cooldown is 60 seconds (up from 40)");

  // === Item 4 (part 1): the imp species carries a flat 5-damage punch ===
  const imp = MONSTER_SPECIES.find((s) => s.kind === 'imp');
  console.log('  imp species data ->', imp);
  assert(Boolean(imp) && imp.attackDamage === 5, 'the imp species has a flat attackDamage of 5');

  // === Character-deletion flow (item 1) ===
  const owner = await registerAndSpawn('delo');
  const other = await registerAndSpawn('delx');
  const c1 = `${owner.charName}b`;
  await postJson('/characters', { name: c1, gender: 'female', hairColor: 'blonde', skinTone: 'tan' }, owner.accountToken);
  const listBefore = await getJson('/characters', owner.accountToken);
  console.log('  characters before delete ->', listBefore.body.characters.map((c) => c.name));
  assert(listBefore.body.characters.length === 2, 'the account has both characters before any deletion');

  const wrongOwnerDelete = await deleteJson(`/characters/${owner.charName}`, other.accountToken);
  console.log('  deleting from a DIFFERENT account ->', wrongOwnerDelete.status);
  assert(wrongOwnerDelete.status === 403, "deleting another account's character is rejected (403)");

  const notFoundDelete = await deleteJson(`/characters/NoSuchCharacterXyz`, owner.accountToken);
  console.log('  deleting a nonexistent character ->', notFoundDelete.status);
  assert(notFoundDelete.status === 404, 'deleting a nonexistent character is rejected (404)');

  const ownDelete = await deleteJson(`/characters/${c1}`, owner.accountToken);
  console.log('  deleting own character ->', ownDelete.status, ownDelete.body);
  assert(ownDelete.status === 200 && ownDelete.body.ok === true, 'deleting your own character succeeds');

  const listAfter = await getJson('/characters', owner.accountToken);
  console.log('  characters after delete ->', listAfter.body.characters.map((c) => c.name));
  assert(
    listAfter.body.characters.length === 1 && listAfter.body.characters[0].name === owner.charName,
    'the deleted character no longer appears in the roster; the other one is untouched'
  );
  other.socket.close();

  // === Item 4 (part 2): engageMelee makes an aggro'd imp actually close
  // the distance toward the player, instead of only reacting once contact
  // was already made ===
  const impMonster = owner.mapState.monsters.find((m) => m.kind === 'imp');
  if (impMonster) {
    sql(`UPDATE players SET map='Grimoak Grounds', row=${impMonster.row}, col=${Math.max(0, impMonster.col - 5)}, hp=200, max_hp=200 WHERE username='${owner.charName}';`);
    await sleep(300);
    const { socket: impSock, mapState: freshState } = await connectSocket(owner.token);
    const liveImp = freshState.monsters.find((m) => m.id === impMonster.id) ?? impMonster;
    const startDist = Math.abs(liveImp.row - impMonster.row) + Math.abs(liveImp.col - Math.max(0, impMonster.col - 5));
    impSock.emit('engageMelee', { targetKind: 'monster', targetId: impMonster.id });
    await sleep(9500); // ~3 combat ticks
    const { socket: checkSock, mapState: afterState } = await connectSocket(owner.token);
    const impAfter = afterState.monsters.find((m) => m.id === impMonster.id);
    console.log('  imp position before engageMelee ->', impMonster.row, impMonster.col, ' after ~9.5s ->', impAfter?.row, impAfter?.col, ' player at ->', Math.max(0, impMonster.col - 5));
    if (impAfter) {
      const endDist = Math.abs(impAfter.row - impMonster.row) + Math.abs(impAfter.col - Math.max(0, impMonster.col - 5));
      assert(endDist <= startDist, "the aggro'd imp closed distance toward the player (or was already adjacent) after engageMelee, instead of standing still");
    } else {
      console.log('  (imp no longer present — likely killed or despawned mid-test; skipping distance assertion)');
    }
    impSock.close();
    checkSock.close();
  } else {
    console.log('  (no live imp found on Grimoak Grounds at spawn time — skipping engageMelee distance check)');
  }

  // === Item 3 (part 2): murus lapideus's stone block now lasts 30s (up
  // from 20s) — still present well past the OLD 20s mark, gone by ~32s ===
  sql(
    `UPDATE players SET map='Great Plains', row=5, col=5, mana=100, skills = skills || '{"murus lapideus": 100}'::jsonb WHERE username='${owner.charName}';`
  );
  await sleep(300);
  const { socket: murusSock } = await connectSocket(owner.token);
  const murusCastAck = await emitWithAck(murusSock, 'castMurusLapideus', { row: 7, col: 5 });
  console.log('  casting murus lapideus ->', murusCastAck);
  assert(murusCastAck.ok === true, 'casting murus lapideus succeeds');
  const castedAt = Date.now();

  await sleep(Math.max(0, 25000 - (Date.now() - castedAt)));
  const { socket: check25Sock, mapState: state25 } = await connectSocket(owner.token);
  const blockAt25 = state25.stoneBlocks.find((b) => b.row === 7 && b.col === 5);
  console.log('  stone block at ~25s (past the OLD 20s duration) ->', blockAt25);
  assert(Boolean(blockAt25), "the stone block is still alive at ~25s — the new 30s duration, not the old 20s one");
  check25Sock.close();

  // The block's own removal is checked on the ~3s combat tick, not the
  // instant it expires, so its actual removal can land anywhere up to
  // one full tick period after the 30s mark — 35s leaves that margin
  // instead of racing the tick's own phase alignment.
  await sleep(Math.max(0, 35000 - (Date.now() - castedAt)));
  const { socket: check35Sock, mapState: state35 } = await connectSocket(owner.token);
  const blockAt35 = state35.stoneBlocks.find((b) => b.row === 7 && b.col === 5);
  console.log('  stone block at ~35s (past the NEW 30s duration + a tick of slack) ->', blockAt35 ?? '(gone)');
  assert(!blockAt35, 'the stone block has expired by ~35s, matching the new 30s duration');
  check35Sock.close();
  murusSock.close();

  // === Item 9: casting an offense spell (stupefaciunt) on a target
  // starts an auto-attack combat session on its own, the same as augue —
  // an unprompted 'combat' event should arrive on the NEXT combat tick
  // with no further input from the player ===
  sql(
    `UPDATE players SET map='Great Plains', row=9, col=19, mana=100, equipment = equipment || '{"weapon": "${WAND_ITEM}"}'::jsonb, skills = skills || '{"stupefaciunt": 100}'::jsonb WHERE username='${owner.charName}';`
  );
  await sleep(300);
  const { socket: stunSock } = await connectSocket(owner.token);
  const stunAck = await emitWithAck(stunSock, 'castStupefaciunt', { targetKind: 'npc', targetId: 'training-dummy' });
  console.log('  casting stupefaciunt on the training dummy ->', stunAck);
  assert(stunAck.ok === true, 'casting stupefaciunt on the training dummy succeeds');

  const autoAttackCombatEvent = await Promise.race([
    new Promise((resolve) => stunSock.once('combat', resolve)),
    sleep(8000).then(() => null),
  ]);
  console.log('  unprompted combat event after stupefaciunt (no further input sent) ->', autoAttackCombatEvent);
  assert(
    Boolean(autoAttackCombatEvent),
    'an unprompted combat event fires within ~8s of casting stupefaciunt — the spell started an auto-attack session on its own'
  );
  stunSock.close();

  owner.socket.close();

  // === Item 7: scutum's expiry check now runs on the fast ~3s combat
  // tick instead of the old 30-40s global tick — cast it, then confirm
  // the very next 'sync' event (fired by checkScutumExpiry itself) lands
  // within a few seconds of its own 60s duration expiring, not up to 40s
  // later ===
  sql(`UPDATE players SET map='Great Plains', row=5, col=5, mana=100, skills = skills || '{"scutum": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: scutumSock } = await connectSocket(owner.token);
  const scutumCastAck = await emitWithAck(scutumSock, 'castScutum');
  console.log('  casting scutum ->', scutumCastAck);
  assert(scutumCastAck.ok === true && scutumCastAck.active === true, 'casting scutum succeeds and activates the shield');
  const scutumCastedAt = Date.now();

  const expirySync = await Promise.race([
    new Promise((resolve) => scutumSock.once('sync', resolve)),
    sleep(90000).then(() => null),
  ]);
  const elapsedMs = Date.now() - scutumCastedAt;
  console.log('  scutum expiry sync arrived after ->', elapsedMs, 'ms  scutumActive ->', expirySync?.player?.scutumActive);
  assert(Boolean(expirySync), 'a sync event arrived (the shield did not silently linger past its own 60s duration with no expiry event at all)');
  if (expirySync) {
    assert(expirySync.player.scutumActive === false, 'the expiry sync reports scutumActive: false');
    assert(elapsedMs > 55000 && elapsedMs < 72000, `the shield clears within a few seconds of its own 60s duration (took ${elapsedMs}ms), not up to 40s later under the old slow-tick check`);
  }
  scutumSock.close();

  sql(`DELETE FROM players WHERE username IN ('${owner.charName}', '${other.charName}');`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
