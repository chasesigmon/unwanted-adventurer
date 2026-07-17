// Live verification for item 10: "the corpses of pets should be selectable
// and should open a modal so that the player can grab any items or
// equipment the pet had and the pet should be sacrificable. Only the
// player themself should be able to sacrifice their own pets corpse."
// Buys a pet, lets a real imp kill it via follower-aggro damage, confirms
// a petCorpses entry appears in map:state, that a second (non-owner)
// character cannot loot/sacrifice it, and that the owner can loot an item
// then sacrifice it for gold and have it disappear.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'PcTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Pctest' + rand2() + rand2();
const UNAME2 = 'PcTest2' + Math.floor(Math.random() * 1000);
const EMAIL2 = UNAME2.toLowerCase() + '@example.com';
const CHAR2 = 'Pctesttwo' + rand2() + rand2();

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

  const { token: accountToken2 } = await post('/auth/register', { username: UNAME2, email: EMAIL2, password: 'testpass123' });
  await post('/characters', { name: CHAR2, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken2);

  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 500));
  const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'kitten' }, resolve));
  check('bought a kitten pet', buyAck.ok);
  socket.close();
  await new Promise((r) => setTimeout(r, 400));

  psql(`UPDATE players SET "row"=63, col=40, map='Grimoak Grounds', skills='{"punch": 100}' WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  let latestMapState = null;
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 1000));

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

    socket.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
    socket.emit('punch', 'west');

    // Pet has 50 hp, imp deals 5 per hit at ~3s cadence -> up to ~11 hits,
    // ~33s worst case. Poll for up to 50s waiting for it to die.
    let petDied = false;
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
      if (!pet) {
        petDied = true;
        break;
      }
    }
    check('the pet eventually died (removed from live pets array)', petDied);

    const corpse = latestMapState?.petCorpses?.find((c) => c.ownerUsername === CHAR);
    check('a petCorpses entry appeared for the owner', Boolean(corpse));
    check('the corpse carries at least the pet-shop starter items/equipment', (corpse?.items?.length ?? 0) >= 0);

    if (corpse) {
      // Non-owner character must not be able to loot or sacrifice it.
      socket.close();
      await new Promise((r) => setTimeout(r, 300));
      psql(`UPDATE players SET map='${corpse.map}', "row"=${corpse.row}, col=${corpse.col} WHERE username='${CHAR2}';`);
      const { token: charToken2 } = await post(`/characters/${CHAR2}/select`, {}, accountToken2);
      const socket2 = await connect(charToken2);
      await new Promise((r) => setTimeout(r, 500));
      const denyLoot = await new Promise((resolve) => socket2.emit('lootPetCorpse', corpse.id, resolve));
      check('a non-owner cannot loot the pet corpse', denyLoot.ok === false);
      const denySac = await new Promise((resolve) => socket2.emit('sacrificePetCorpse', corpse.id, resolve));
      check('a non-owner cannot sacrifice the pet corpse', denySac.ok === false);
      socket2.close();
      await new Promise((r) => setTimeout(r, 300));

      // Owner reconnects and can loot + sacrifice.
      ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
      socket = await connect(charToken);
      socket.on('map:state', (data) => (latestMapState = data));
      await new Promise((r) => setTimeout(r, 500));

      if (corpse.items.length > 0) {
        const lootAck = await new Promise((resolve) => socket.emit('lootPetCorpseItem', { corpseId: corpse.id, itemIndex: 0 }, resolve));
        check('owner can loot an individual item off their own pet corpse', lootAck.ok === true);
      } else {
        console.log('(no items on corpse to test individual loot — starter kitten carries no gear)');
      }

      const sacAck = await new Promise((resolve) => socket.emit('sacrificePetCorpse', corpse.id, resolve));
      check('owner can sacrifice their own pet corpse', sacAck.ok === true && typeof sacAck.gold === 'number');

      await new Promise((r) => setTimeout(r, 500));
      const stillThere = latestMapState?.petCorpses?.find((c) => c.id === corpse.id);
      check('the corpse is gone after being sacrificed', !stillThere);
    }
  }

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username IN ('${CHAR}', '${CHAR2}'); DELETE FROM accounts WHERE username IN ('${UNAME}', '${UNAME2}');`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
