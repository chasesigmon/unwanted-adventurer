// Live verification for item 5: "monsters... hitting the pet/summon/
// animated really fast per millisecond" — a real regression from last
// session's follower-aggro generalization (stepTowardAggroTarget's
// damageFollower call had no cooldown at all, firing every FOLLOWER_STEP_MS
// fast tick, ~220ms, instead of the intended ~3s combat cadence). Buys a
// pet, gets a real imp aggro'd onto it, and confirms damage lands roughly
// once per ATTACK_COOLDOWN_MS (3000ms), not dozens of times per second.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FdcTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Fdctest' + rand2() + rand2();

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
  psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6 WHERE username='${CHAR}';`);

  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 500));
  const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'kitten' }, resolve));
  check('bought a kitten pet', buyAck.ok);
  socket.close();
  await new Promise((r) => setTimeout(r, 400));

  // Find a real imp near the spawn tile, then position both the player
  // (so the pet snaps to them on map change) and re-check the imp's own
  // current position (it may patrol/wander) before engaging.
  psql(`UPDATE players SET "row"=63, col=40, map='Grimoak Grounds', skills='{"punch": 100}' WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  let latestMapState = null;
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 1000));

  // Pick the CLOSEST imp to the pet's own current position, not just any
  // imp — the pet only instantly snaps to the owner on a real MAP change
  // (Bramwick Pet Shop -> Grimoak Grounds, just happened above); a
  // same-map teleport below still makes it walk the whole remaining
  // distance one tile per fast tick, so picking the nearest candidate
  // keeps that catch-up short.
  const myPet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  const candidateImps = latestMapState?.monsters?.filter((m) => m.kind === 'imp' && !m.isRare) ?? [];
  const imp = candidateImps
    .map((m) => ({ m, dist: Math.abs(m.row - (myPet?.row ?? 0)) + Math.abs(m.col - (myPet?.col ?? 0)) }))
    .sort((a, b) => a.dist - b.dist)[0]?.m;
  check('a real wild imp is present', Boolean(imp));
  if (imp) {
    socket.close();
    await new Promise((r) => setTimeout(r, 400));
    psql(`UPDATE players SET "row"=${imp.row}, col=${imp.col + 1} WHERE username='${CHAR}';`);
    ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
    socket = await connect(charToken);
    socket.on('map:state', (data) => (latestMapState = data));
    await new Promise((r) => setTimeout(r, 700));

    // Engage the imp directly with the player (melee), which redirects
    // its aggro onto the living pet (item 4's own fix from last batch).
    socket.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    socket.emit('punch', 'west');
    await new Promise((r) => setTimeout(r, 300));

    const startPetHp = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR)?.hp;
    console.log('pet starting hp:', startPetHp);

    // Sample the pet's hp every 300ms (the fast tick's own cadence) for
    // 6 seconds — with the bug, hp would crater almost instantly (many
    // hits within the first second or two); with the fix, at most ~2
    // hits should land in a 6s window (cooldown ~3s).
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
      samples.push(pet ? pet.hp : 0);
    }
    console.log('pet hp samples over 6s:', samples.join(', '));

    // Count actual hp DROPS (a hit landing), not just "hp changed" (pet
    // regen could nudge it up between hits too).
    let hitsLanded = 0;
    let prev = startPetHp;
    for (const hp of samples) {
      if (hp < prev) hitsLanded++;
      prev = hp;
    }
    console.log(`hits landed in ~6s: ${hitsLanded}`);
    check('at most 2-3 hits landed in 6s (not dozens — the actual bug)', hitsLanded <= 3);
    check('the pet took at least 1 hit (the mechanic still works at all)', hitsLanded >= 1);
  }

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
