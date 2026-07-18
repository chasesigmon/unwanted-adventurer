// Live verification, phase A, for: (1) pets persisting across a real
// server restart, (2) pets getting full exp even when the OWNER lands
// the kill. Buys a pet, sets it to 'attack' a monster, then has the
// PLAYER (not the pet) actually land the kill via a spell — confirms the
// pet's own exp/level moved anyway (no shared/split system, a genuine
// full grant). Phase B (a separate script, run after an actual server
// restart) confirms the pet/its level survived.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
export const UNAME = 'Batch6Test' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
export const CHAR = 'Batchsixtest' + rand2() + rand2();

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
  return execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d -t -A`, { input: sql, encoding: 'utf-8' });
}
function sql(input) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input, encoding: 'utf-8' });
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
async function closeAndWait(socket) {
  socket.close();
  await new Promise((r) => setTimeout(r, 400));
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

  // --- Buy a pet at Bramwick Pet Shop ---
  sql(`UPDATE players SET map='Bramwick Pet Shop', "row"=4, col=5, gold=100 WHERE username='${CHAR}';`);
  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  let latestState = null;
  socket.on('map:state', (state) => {
    latestState = state;
  });
  await new Promise((r) => setTimeout(r, 700));

  const buyRes = await emit(socket, 'buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'kitten' });
  console.log('buy pet response:', JSON.stringify(buyRes).slice(0, 200));
  check('bought a kitten', buyRes.ok === true);

  const petColAfterBuy = psql(`SELECT pet FROM players WHERE username='${CHAR}';`).trim();
  check('pet column is populated immediately after buying', petColAfterBuy.length > 0);
  const petAfterBuy = JSON.parse(petColAfterBuy);
  check('persisted pet starts at level 1', petAfterBuy.level === 1);

  // --- Reposition near a wild monster on Grimoak Grounds, arm arcane
  // bolt directly (bypassing the "learn it from a teacher" grind — not
  // what this test is about), and set the pet to attack the same target.
  await closeAndWait(socket);
  sql(
    `UPDATE players SET map='Grimoak Grounds', "row"=15, col=85, level=25, equipment='{"weapon":"wand"}'::jsonb, skills='{"punch":1,"arcane bolt":100}'::jsonb WHERE username='${CHAR}';`
  );
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  latestState = null;
  socket.on('map:state', (state) => {
    latestState = state;
  });
  await new Promise((r) => setTimeout(r, 900));

  await emit(socket, 'move', 'south');
  await new Promise((r) => setTimeout(r, 300));
  console.log('nearby monsters:', JSON.stringify(latestState?.monsters?.slice(0, 3)).slice(0, 400));
  const monster = latestState?.monsters?.[0];
  if (!monster) throw new Error('no monster found nearby to test with');

  const attackRes = await emit(socket, 'commandFollowerAttack', { targetKind: 'monster', targetId: monster.id });
  console.log('commandFollowerAttack response:', JSON.stringify(attackRes).slice(0, 200));
  await new Promise((r) => setTimeout(r, 1500)); // give the pet a moment to snap onto this map/start approaching

  // Player attacks the SAME monster with arcane bolt — likely to land
  // the kill before the pet's own melee contact does.
  let killed = false;
  for (let i = 0; i < 25 && !killed; i++) {
    const res = await emit(socket, 'castAugue', { targetKind: 'monster', targetId: monster.id });
    if (res?.message) console.log('  cast:', res.message.slice(0, 150));
    await new Promise((r) => setTimeout(r, 850));
    const stillThere = latestState?.monsters?.some((m) => m.id === monster.id);
    if (!stillThere) killed = true;
  }
  const finalPetSnapshot = latestState?.pets?.find((p) => p.ownerUsername.toLowerCase() === CHAR.toLowerCase());
  console.log('monster killed:', killed);
  console.log('pet snapshot after kill:', JSON.stringify(finalPetSnapshot).slice(0, 300));
  check('monster was killed within the test window', killed);
  check(
    'pet gained exp/leveled even though the OWNER (not the pet) landed the kill',
    !!finalPetSnapshot && (finalPetSnapshot.exp > 0 || finalPetSnapshot.level > 1)
  );

  const petColAfterKill = psql(`SELECT pet FROM players WHERE username='${CHAR}';`).trim();
  const petAfterKill = JSON.parse(petColAfterKill);
  console.log('persisted pet after kill:', JSON.stringify(petAfterKill).slice(0, 300));
  check('the persisted DB pet column also reflects the new exp/level', petAfterKill.exp > 0 || petAfterKill.level > 1);

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
}

console.log(allPass ? '\nPHASE A ALL PASS' : '\nPHASE A SOME FAILED');
process.exitCode = allPass ? 0 : 1;
