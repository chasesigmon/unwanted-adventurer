// Live verification for this 8-item batch (item 5, the ASCII world-map
// sketch, was a pure conversational example — nothing to verify). Covers
// what's server-observable: the skill-growth chance bump to 5%, the new
// /dance command's full lifecycle (start, visible to sync/map:state,
// cancelled by movement), and confirms the new room-zoom treatment
// (item 8) didn't accidentally change any room's own tile dimensions —
// only the CLIENT's camera zoom changed, which needs a browser to see.
//
// NOT scripted here (pure client-only rendering/positioning, no server
// signal — verified instead by typecheck/build + a quick manual
// dev-server check): the augue ack-message client bug (server always
// returned the correct fumble message — see batch14's own test, which
// already proved that), the imp sprite-freeze-during-combat fix (a
// Phaser tween/animation bug, confirmed via code review plus batch14's
// proof that the server-side position data was already correct), the
// podium label's vertical offset, the dance animation's own visual, and
// the new per-room-family camera zoom itself.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch15.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import { SKILL_GROWTH_CHANCE } from '../game2d/dist/server/combat/formulas.js';

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
  // === Item 2: skill growth chance bumped to 5% (up from 2%) ===
  assert(SKILL_GROWTH_CHANCE === 0.05, `SKILL_GROWTH_CHANCE is 0.05 (was ${SKILL_GROWTH_CHANCE})`);

  // === Item 8: the room-zoom treatment is client-only — confirm the
  // rooms' own TILE DIMENSIONS were not touched in the process ===
  const greatHall = getMap('Great Hall');
  const commonRoom = getMap('Thistledown Common Room');
  const dorm = getMap('Thistledown Dorms');
  const secretRoom = getMap('Caverna Secretissima');
  const utilityClassroom = getMap('Utility Classroom');
  console.log(
    '  Great Hall ->', greatHall.rows, 'x', greatHall.cols,
    ' Common Room ->', commonRoom.rows, 'x', commonRoom.cols,
    ' Dorm ->', dorm.rows, 'x', dorm.cols,
    ' Secret Room ->', secretRoom.rows, 'x', secretRoom.cols,
    ' Utility Classroom ->', utilityClassroom.rows, 'x', utilityClassroom.cols
  );
  assert(greatHall.rows === 27 && greatHall.cols === 40, "Great Hall's own tile size is unchanged (27x40)");
  assert(commonRoom.rows === greatHall.rows && commonRoom.cols === greatHall.cols, "a common room's tile size is unchanged and still matches the Great Hall's");
  assert(secretRoom.rows === utilityClassroom.rows && secretRoom.cols === utilityClassroom.cols, "the secret room's tile size still exactly matches a classroom's (unchanged)");

  const owner = await registerAndSpawn('bdance');

  // === Item 6: /dance — starts, shows up in sync AND map:state (for
  // other players), and moving cancels it ===
  const other = await registerAndSpawn('bwatch');
  other.socket.close();
  sql(`UPDATE players SET map='Great Plains', row=5, col=5 WHERE username IN ('${owner.charName}', '${other.charName}');`);
  await sleep(300);
  // Both reconnect FRESH after the SQL move — a socket already connected
  // before a raw SQL position write stays in whatever room it originally
  // joined (Socket.IO room membership/in-memory location is only set at
  // connect time), so `other` would never even join the 'Great Plains'
  // room otherwise and would silently miss every map:state broadcast for
  // it, same reconnect-ordering pitfall the earlier imp-chase test hit.
  const { socket: ownerSock } = await connectSocket(owner.token);
  const { socket: otherSock } = await connectSocket(other.token);
  const otherMapStatePromise = new Promise((resolve) => {
    const onState = (m) => {
      const me = m.players.find((p) => p.username === owner.charName);
      if (me?.dancing) {
        otherSock.off('map:state', onState);
        resolve(m);
      }
    };
    otherSock.on('map:state', onState);
  });

  const danceSyncPromise = new Promise((resolve) => ownerSock.once('sync', resolve));
  ownerSock.emit('chat', '/dance');
  const danceSync = await Promise.race([danceSyncPromise, sleep(3000).then(() => null)]);
  console.log('  sync after /dance ->', danceSync?.player?.dancing, danceSync?.player?.restState);
  assert(Boolean(danceSync) && danceSync.player.dancing === true, '/dance sets dancing:true in the caster\'s own sync');
  assert(danceSync.player.restState === 'awake', '/dance leaves restState as awake (a cosmetic-only state, not a heal-rate one)');

  const otherSawDancing = await Promise.race([otherMapStatePromise, sleep(3000).then(() => null)]);
  console.log('  a nearby player\'s own map:state shows the dancer ->', Boolean(otherSawDancing));
  assert(Boolean(otherSawDancing), 'a NEARBY player also sees dancing:true via map:state, not just the dancer\'s own client');

  const moveAck = await emitWithAck(ownerSock, 'move', 'north');
  console.log('  move ack after dancing ->', moveAck.ok, ' dancing now ->', moveAck.player?.dancing);
  assert(moveAck.ok === true && moveAck.player.dancing === false, 'moving cancels dancing (the ack\'s own player snapshot already shows dancing:false)');

  // Re-issue /dance and confirm it also toggles off if called again while
  // already dancing (a reasonable symmetric affordance, not just movement).
  const redancSyncPromise = new Promise((resolve) => ownerSock.once('sync', resolve));
  ownerSock.emit('chat', '/dance');
  await Promise.race([redancSyncPromise, sleep(3000)]);
  const toggleOffSyncPromise = new Promise((resolve) => ownerSock.once('sync', resolve));
  ownerSock.emit('chat', '/dance');
  const toggleOffSync = await Promise.race([toggleOffSyncPromise, sleep(3000).then(() => null)]);
  console.log('  dancing after a second /dance (toggle off) ->', toggleOffSync?.player?.dancing);
  assert(Boolean(toggleOffSync) && toggleOffSync.player.dancing === false, 'issuing /dance again while already dancing toggles it back off');

  ownerSock.close();
  otherSock.close();

  sql(`DELETE FROM players WHERE username IN ('${owner.charName}', '${other.charName}');`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
