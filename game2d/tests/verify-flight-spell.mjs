// Live verification for item 2: the flight spell (level 25, 5 practice
// points, 30 mana, 3-minute duration/4-minute cooldown, crosses water,
// spacebar-style burst with its own 10s cooldown). Grants the skill
// directly via SQL (same "inject skills, don't grind to it" convention
// used throughout this session) rather than actually leveling/practicing
// up, then casts it and drives the water-crossing + burst mechanics
// directly over the socket (no browser, so "press spacebar" is simulated
// as the `flightBurst` emit itself).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'FlightTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Flighttest' + rand2() + rand2();

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
  // Row 63, col 50 sits just south of the south moat's OUTER edge (row
  // 62) at a column well clear of the bridge (cols 38-42 at this crossing
  // are the walkable bridge itself, not water) — one step north crosses
  // straight into real moat water.
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=50, level=25, mana=100, max_mana=100, skills='{"flight": 100}' WHERE username='${CHAR}';`);

  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestSync = null;
  socket.on('sync', (data) => (latestSync = data));
  await new Promise((r) => setTimeout(r, 700));

  // Before casting: walking north into the moat should be rejected.
  const blockedMove = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  check('walking into the moat is blocked while not flying', blockedMove.ok === false);

  const castAck = await new Promise((resolve) => socket.emit('castFlight', resolve));
  check('cast flight successfully', castAck.ok === true);
  await new Promise((r) => setTimeout(r, 300));
  check('flightActive is true after casting', latestSync?.player?.flightActive === true);
  check('mana was deducted (100 - 30 = 70)', latestSync?.player?.mana === 70);

  // Now walking north into the moat should succeed.
  const flyingMove = await new Promise((resolve) => socket.emit('move', 'north', resolve));
  check('walking into the moat succeeds while flying', flyingMove.ok === true);
  check('player actually moved onto the water tile (row 62)', flyingMove.player?.row === 62);

  // Flight burst: facing north (just moved that way), burst again should
  // travel further north over more water tiles.
  const startRow = flyingMove.player.row;
  const burstAck = await new Promise((resolve) => socket.emit('flightBurst', 'north', resolve));
  check('flight burst succeeds', burstAck.ok === true);
  check('flight burst actually moved the player north', burstAck.player.row < startRow);
  console.log(`burst moved from row ${startRow} to row ${burstAck.player.row} (up to 10 tiles)`);

  // Immediately re-bursting should hit the 10s secondary cooldown.
  const secondBurstAck = await new Promise((resolve) => socket.emit('flightBurst', 'north', resolve));
  check('re-bursting immediately is rejected (10s cooldown)', secondBurstAck.ok === false && /recharging/.test(secondBurstAck.message ?? ''));
  check('flightBurstReadyAt is set on the synced profile', typeof secondBurstAck.player?.flightBurstReadyAt === 'number');
  socket.close();
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
