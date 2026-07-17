// Live verification for item 11: "If all of the Illusionist's duplicates
// die then the [duplicate] affect should go away from the affects modal."
// checkDuplicateExpiry already cleared duplicateActiveUntil on the natural
// 5-minute TTL, but a duplicate killed early in combat (via the same
// follower-aggro path pets take) never went through that sweep, leaving a
// stale Affects-panel countdown. Casts create duplicate (skill injected via
// SQL so a level-1 character can cast it, keeping its hp low enough to kill
// quickly), redirects a real imp's aggro onto it, and confirms
// duplicateActiveUntil flips to null (via a 'sync' event) once it dies.
//
// IMPORTANT: a reconnect wipes duplicateActiveUntil AND removes any
// animated monster outright (see the socket-connect handler's own doc
// comment on duplicateActiveUntil), so unlike the pet-corpse test this
// script repositions next to a real imp FIRST, then does everything else
// — casting, engaging, punching, polling for death — on that single
// uninterrupted connection.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'DupTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Duptest' + rand2() + rand2();

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('POST ' + path + ' failed: ' + JSON.stringify(json));
  return json;
}
function psql(sql) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(
    `UPDATE players SET "row"=63, col=40, map='Grimoak Grounds', mana=100, max_mana=100, skills='{"punch": 100, "create duplicate": 100}' WHERE username='${CHAR}';`
  );

  // First, a short throwaway connection just to discover a real imp's
  // current position (no casting/combat happens on this one).
  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  let latestMapState = null;
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 1000));

  const candidateImps = latestMapState?.monsters?.filter((m) => m.kind === 'imp' && !m.isRare) ?? [];
  const imp = candidateImps
    .map((m) => ({ m, dist: Math.abs(m.row - 63) + Math.abs(m.col - 40) }))
    .sort((a, b) => a.dist - b.dist)[0]?.m;
  check('a real wild imp is present', Boolean(imp));
  socket.close();
  await new Promise((r) => setTimeout(r, 400));

  if (imp) {
    psql(`UPDATE players SET "row"=${imp.row}, col=${imp.col + 1} WHERE username='${CHAR}';`);

    // Reconnect ONCE here, then do everything else — cast, engage,
    // punch, poll for death — on this single uninterrupted connection.
    ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
    socket = await connect(charToken);
    let latestSync = null;
    socket.on('map:state', (data) => (latestMapState = data));
    socket.on('sync', (data) => (latestSync = data));
    await new Promise((r) => setTimeout(r, 700));

    const castAck = await new Promise((resolve) => socket.emit('castCreateDuplicate', resolve));
    check('cast create duplicate successfully', castAck.ok === true);
    await new Promise((r) => setTimeout(r, 500));

    check('duplicateActiveUntil is set after casting', typeof latestSync?.player?.duplicateActiveUntil === 'number');

    const myDuplicate = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR);
    check('the duplicate appears in animatedMonsters', Boolean(myDuplicate));

    socket.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    socket.emit('punch', 'west');

    // Duplicate hp = 0.75 * maxHp(100) = 75, imp does 5/hit at ~3s
    // cadence -> up to 15 hits, ~45s worst case. Poll up to ~65s.
    let duplicateDied = false;
    for (let i = 0; i < 130; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const dup = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR);
      if (!dup) {
        duplicateDied = true;
        break;
      }
    }
    check('the duplicate eventually died (removed from live animatedMonsters)', duplicateDied);

    // Give the death-triggered sync a moment to arrive, then check the
    // most recent sync payload reflects the cleared affect.
    await new Promise((r) => setTimeout(r, 800));
    check('duplicateActiveUntil cleared to null after it died in combat', latestSync?.player?.duplicateActiveUntil === null);

    socket.close();
  }
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
