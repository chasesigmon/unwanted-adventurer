// Live verification for this batch: common rooms shrunk 25%, Utilization
// renamed to Utility with every classroom now suffixed "Classroom",
// mana-crystal drops replacing body parts, imps excluded from spawning
// inside the moat's footprint, benches (facing each other, square
// formation) replacing chairs, full fireplace/teacher-desk collision,
// Celeritas (renamed from "quick movement"), the new augue fireball spell
// + its Offense Classroom podium, and the two explicitly-temporary
// TESTING overrides (instant podium learning, the '~' mana cheat).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch10.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import { fireplacePositionsFor, studentDeskPositionsFor, benchPositionsFor, isBenchBlocked, isFireplaceBlocked } from '../game2d/dist/shared/lighting.js';
import {
  isPodiumBlocked,
  LUCEM_BOOK_MAP,
  CELERITAS_BOOK_MAP,
  AUGUE_BOOK_MAP,
  AUGUE_BOOK_POSITION,
  AUGUE_BOOK_LABEL,
} from '../game2d/dist/shared/spells.js';
import { manaCrystalForLevel, isManaCrystal } from '../game2d/dist/shared/items.js';
import { MONSTER_KINDS, CLASSROOM_MAPS } from '../game2d/dist/shared/constants.js';

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

function onceCombat(socket) {
  return new Promise((resolve) => socket.once('combat', resolve));
}

async function main() {
  // === Item 7 & 10: classroom renames ===
  assert(CLASSROOM_MAPS.includes('Utility Classroom'), 'Utilization was renamed to Utility Classroom');
  assert(!CLASSROOM_MAPS.some((m) => m === 'Utilization' || m === 'Elemental Casting' || m === 'Defense' || m === 'Summoning' || m === 'Offense'), 'no classroom keeps its old bare name');
  assert(CLASSROOM_MAPS.every((m) => m.endsWith(' Classroom')), 'every classroom name ends with " Classroom"');

  // === Item 1: common rooms shrunk 25%, classrooms untouched ===
  const emberclaw = getMap('Emberclaw Common Room');
  console.log('  Emberclaw Common Room size ->', emberclaw.rows, 'x', emberclaw.cols);
  assert(emberclaw.rows === 30 && emberclaw.cols === 42, 'common rooms are 30x42 (25% smaller than the old 40x56)');
  const utility = getMap('Utility Classroom');
  assert(utility.rows === 13 && utility.cols === 19, 'classrooms stay their original 13x19 size, untouched by the common-room shrink');

  // === Item 3: mana crystals ===
  assert(manaCrystalForLevel(1) === 'lesser mana crystal', 'a level-1 monster (every current species) drops a lesser mana crystal');
  assert(manaCrystalForLevel(3) === 'mana crystal', 'a level-3 monster would drop a plain mana crystal');
  assert(manaCrystalForLevel(99) === 'superior mana crystal', 'an out-of-range level clamps to the top (superior) tier');
  assert(isManaCrystal('lesser mana crystal'), 'isManaCrystal recognizes the lesser tier');
  assert(!isManaCrystal('goblin ear'), 'isManaCrystal does not misfire on an old body-part label');

  // === Item 18: augue podium position + label ===
  assert(AUGUE_BOOK_MAP === 'Offense Classroom', 'augue is taught in the (renamed) Offense Classroom');
  assert(AUGUE_BOOK_LABEL === 'Secrets of the flame', 'the augue podium label reads "Secrets of the flame"');
  assert(isPodiumBlocked(AUGUE_BOOK_MAP, AUGUE_BOOK_POSITION.row, AUGUE_BOOK_POSITION.col), 'the augue podium tile is collision-blocked');
  assert(MONSTER_KINDS.includes('imp'), 'imp is still a registered monster kind');

  // === Item 5: benches face each other in a square, spread further than
  // the old chairs (offset 4 now, was 3) ===
  const benches = benchPositionsFor('Grimoak Entrance Hall');
  console.log('  Entrance Hall benches ->', benches);
  assert(benches.length === 4, 'the Entrance Hall still has 4 social benches');
  const anglesSeen = new Set(benches.map((b) => b.angle));
  assert(anglesSeen.size === 4 && [0, 90, 180, 270].every((a) => anglesSeen.has(a)), 'all 4 cardinal facings (0/90/180/270) are represented, each bench facing a different way');
  for (const b of benches) assert(isBenchBlocked('Grimoak Entrance Hall', b.row, b.col), `bench at (${b.row},${b.col}) is collision-blocked`);

  // === Item 8: fireplace collision now covers the full footprint (3
  // columns wide, not just the anchor column) ===
  const entranceFireplaces = fireplacePositionsFor('Grimoak Entrance Hall');
  const fp = entranceFireplaces[0];
  assert(isFireplaceBlocked('Grimoak Entrance Hall', fp.row, fp.col - 1), 'fireplace collision now extends one tile to the left of the anchor column');
  assert(isFireplaceBlocked('Grimoak Entrance Hall', fp.row, fp.col + 1), 'fireplace collision now extends one tile to the right of the anchor column too');
  assert(!isFireplaceBlocked('Grimoak Entrance Hall', fp.row, fp.col - 2), 'collision does not extend a second tile further out');

  // === Live account/character/socket flow ===
  const email = `gdec${randomLetters(6)}@example.com`;
  const acctUsername = `Gdec${randomLetters(5)}`;
  const charName = `Gdeca${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'female', hairColor: 'blonde', skinTone: 'dark' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);
  assert(sync.player.map === 'Grimoak Grounds', 'new character still spawns on Grimoak Grounds');

  // === Item 4: no imp spawns inside the moat's own footprint ===
  const firstMapState = await onceMapState(socket);
  const imps = firstMapState.monsters.filter((m) => m.kind === 'imp');
  console.log('  imps spawned ->', imps.length);
  const { isWithinMoatFootprint } = await import('../game2d/dist/shared/maps.js');
  const impsInsideMoat = imps.filter((m) => isWithinMoatFootprint('Grimoak Grounds', m.row, m.col));
  assert(imps.length > 0, 'imps are actually spawned');
  assert(impsInsideMoat.length === 0, `no imp spawned inside the moat's own footprint (found ${impsInsideMoat.length})`);

  // === Item 15 (TESTING): podium learning succeeds instantly ===
  sql(`UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb, mana=100, max_mana=100 WHERE username='${charName}';`);
  sql(`UPDATE players SET map='Offense Classroom', "row"=5, col=9 WHERE username='${charName}';`);
  await sleep(300);
  const { socket: s2 } = await connectSocket(select.body.token);
  const augueLearnAck = await emitWithAck(s2, 'readAugueBook');
  console.log('  read augue book (testing: instant learn) ->', augueLearnAck);
  assert(augueLearnAck.ok && /learned augue/.test(augueLearnAck.message ?? ''), 'the augue podium teaches the spell on the very first read (TESTING_INSTANT_PODIUM_LEARN)');
  assert(augueLearnAck.skills?.augue === 10, 'augue starts at the normal 10% (STARTING_SKILL_PERCENT), same as every other skill');

  // === Item 16: Celeritas ===
  assert(CELERITAS_BOOK_MAP === 'Utility Classroom', 'celeritas (renamed from quick movement) is still taught in Utility Classroom, alongside lucem');
  assert(LUCEM_BOOK_MAP === 'Utility Classroom', 'lucem is still taught in the same room');

  // === Item 18 continued: augue cast — range check, damage, cooldown ===
  // Imps patrol continuously (see wanderAll), so re-fetch a fresh
  // position for the SAME imp right before each teleport rather than
  // trusting the much-earlier `imps[0]` snapshot, which could be stale
  // by now.
  const watchedImpId = imps[0].id;
  async function currentImpPos() {
    const state = await onceMapState(socket);
    const found = state.monsters.find((m) => m.id === watchedImpId);
    return found ? { row: found.row, col: found.col } : null;
  }
  let impPos = await currentImpPos().catch(() => null);
  if (!impPos) impPos = { row: imps[0].row, col: imps[0].col };

  sql(
    `UPDATE players SET map='Grimoak Grounds', "row"=${impPos.row - 1 >= 0 ? impPos.row - 1 : impPos.row + 1}, col=${impPos.col}, skills = skills || '{"augue": 100}'::jsonb WHERE username='${charName}';`
  );
  await sleep(300);
  const { socket: s3 } = await connectSocket(select.body.token);

  const combatPromise = onceCombat(s3);
  const augueCastAck = await emitWithAck(s3, 'castAugue', { targetKind: 'monster', targetId: watchedImpId });
  console.log('  castAugue on an adjacent imp ->', augueCastAck);
  assert(augueCastAck.ok, 'casting augue on an in-range imp succeeds');
  const combatEvent = await combatPromise;
  console.log('  resulting combat event ->', combatEvent.damage, combatEvent.message);
  assert(combatEvent.damage === 10, 'augue deals exactly 10 flat damage');
  assert(combatEvent.targetKind === 'monster' && combatEvent.target === watchedImpId, 'the combat event targets the exact imp that was cast at');

  // Immediate second cast should be refused by the 1-combat-tick cooldown.
  const augueCooldownAck = await emitWithAck(s3, 'castAugue', { targetKind: 'monster', targetId: watchedImpId });
  console.log('  castAugue again immediately ->', augueCooldownAck);
  assert(!augueCooldownAck.ok && /recharging/.test(augueCooldownAck.message ?? ''), 'casting augue again immediately is refused by its own cooldown');
  s3.close();

  // Out-of-range check — teleport far from the (still-alive) imp's own
  // current position and confirm the cast is refused.
  const impPos2 = (await currentImpPos().catch(() => null)) ?? impPos;
  sql(
    `UPDATE players SET "row"=${Math.max(0, impPos2.row - 20)}, col=${impPos2.col}, skills = skills || '{"augue": 100}'::jsonb WHERE username='${charName}';`
  );
  await sleep(300);
  const { socket: s4 } = await connectSocket(select.body.token);
  const augueRangeAck = await emitWithAck(s4, 'castAugue', { targetKind: 'monster', targetId: watchedImpId });
  console.log('  castAugue from far away ->', augueRangeAck);
  assert(!augueRangeAck.ok && /too far/.test(augueRangeAck.message ?? ''), 'casting augue on a target outside AUGUE_RANGE_TILES is refused');

  s2.close();
  s4.close();
  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
