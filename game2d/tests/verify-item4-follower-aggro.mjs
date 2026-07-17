// Live verification for item 4: "the pet/animated/summon (follower)
// should draw the aggro of the monster that either they attack first or
// that the player attacks, and the monster should then go to attack the
// follower." Buys a pet, has the OWNER engage a real monster (not the
// pet directly), and confirms the monster's proactive chase targets the
// pet's position (not the player's) and the pet's own hp drops over a
// few seconds of contact.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Item4Test' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Aggrtest' + rand2() + rand2();

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
  await new Promise((r) => setTimeout(r, 300));

  // Set the pet to 'attack' mode ahead of time isn't required — item 4's
  // trigger is "the monster the PLAYER attacks" — just being adjacent and
  // punching a real imp should be enough to redirect that imp's own aggro
  // onto the living pet, wherever it's standing (following the owner).
  psql(`UPDATE players SET "row"=63, col=40, map='Grimoak Grounds', skills='{"punch": 100}' WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  let latestMapState = null;
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 1200));

  const myPet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  check('pet is present and alive', Boolean(myPet?.alive));

  // Pick the CLOSEST imp to the pet's own current position, not just any
  // imp — the pet only INSTANTLY snaps to the owner on a real MAP change
  // (already happened above, Bramwick Pet Shop -> Grimoak Grounds); a
  // same-map teleport below still makes it walk the whole remaining
  // distance one tile per fast tick, so picking the nearest candidate
  // keeps that catch-up well within this test's own patience.
  const candidateImps = latestMapState?.monsters?.filter((m) => m.kind === 'imp' && !m.isRare) ?? [];
  const targetImp = candidateImps
    .map((m) => ({ m, dist: Math.abs(m.row - (myPet?.row ?? 0)) + Math.abs(m.col - (myPet?.col ?? 0)) }))
    .sort((a, b) => a.dist - b.dist)[0]?.m;
  check('a real wild imp is present', Boolean(targetImp));
  if (!myPet || !targetImp) throw new Error('missing prerequisites, aborting');

  // Reposition the player right next to the imp so a direct punch lands
  // immediately (proving contact resolves promptly — items 12/13's own
  // fix — and giving setAggro something to redirect).
  socket.close();
  psql(`UPDATE players SET "row"=${targetImp.row}, col=${targetImp.col + 1} WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 800));

  // Both engageMelee and punch are fire-and-forget (void handlers, no ack
  // callback at all) — awaiting an ack from either hangs forever. punch
  // takes a facing DIRECTION, not a target id; the player was placed one
  // tile west of the imp above, so facing 'east' lands on it directly.
  socket.emit('engageMelee', { targetKind: 'monster', targetId: targetImp.id });
  socket.emit('punch', 'east');
  await new Promise((r) => setTimeout(r, 500));

  const startPetHp = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR)?.hp ?? myPet.hp;
  const startImpHp = latestMapState?.monsters?.find((m) => m.id === targetImp.id)?.hp;
  console.log(`Pet starting hp: ${startPetHp}, imp starting hp: ${startImpHp}, imp starting pos: (${targetImp.row},${targetImp.col})`);

  // Poll for a few seconds watching the pet's own hp for a drop — proof
  // the imp's proactive aggro chase redirected onto the pet and actually
  // dealt damage to it (previously: "no monster in this game ever
  // damages a pet/animated monster at all").
  let petDamaged = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const currentPet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
    const currentImp = latestMapState?.monsters?.find((m) => m.id === targetImp.id);
    console.log(
      `t=${(i + 1) * 300}ms pet hp=${currentPet?.hp} pos=(${currentPet?.row},${currentPet?.col}) | imp hp=${currentImp?.hp} pos=${currentImp ? `(${currentImp.row},${currentImp.col})` : 'dead/gone'}`
    );
    if (currentPet && currentPet.hp < startPetHp) {
      petDamaged = true;
      console.log(`Pet hp dropped after ~${(i + 1) * 300}ms: ${startPetHp} -> ${currentPet.hp}`);
      break;
    }
  }
  check('the imp actually damaged the pet (aggro redirected onto follower)', petDamaged);

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
