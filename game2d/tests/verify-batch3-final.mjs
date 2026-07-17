// Live smoke test for the 14-item follow-up batch's remaining server-side
// changes not already covered by tests/verify-item4-follower-aggro.mjs or
// tests/verify-item11-13-fix.mjs: item 2 (teacher name swap-back), item 3
// (corpse-loot ownership restriction), item 7 (give-to-follower
// equippability restriction), item 10 (create-duplicate Affects field).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Batch3Test' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Bthreetest' + rand2() + rand2();
const CHAR2 = 'Bthreeother' + rand2() + rand2();
const UNAME2 = 'Batch3Test2' + Math.floor(Math.random() * 1000);
const EMAIL2 = UNAME2.toLowerCase() + '@example.com';

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
    `UPDATE players SET level=20, "row"=63, col=40, map='Grimoak Entrance Hall', equipment='{"weapon":"wand"}', skills='{"punch": 100, "create duplicate": 100}', specialization='illusionist', mana=200, max_mana=200 WHERE username='${CHAR}';`
  );
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestMapState = null;
  let latestPlayer = null;
  socket.on('map:state', (data) => (latestMapState = data));
  socket.on('sync', (data) => {
    if (data.player) latestPlayer = data.player;
  });
  await new Promise((r) => setTimeout(r, 800));

  // --- Item 2: teacher names swapped back ---
  const fireplaceTeacher = latestMapState?.teachers?.find((t) => t.id === 'map-quest-teacher');
  const benchTeacher = latestMapState?.teachers?.find((t) => t.id === 'house-teacher');
  check(`fireplace teacher is Hollowell (got "${fireplaceTeacher?.name}")`, fireplaceTeacher?.name === 'Professor Hollowell');
  check(`bench teacher is Caldwell (got "${benchTeacher?.name}")`, benchTeacher?.name === 'Professor Caldwell');

  // --- Item 10: create duplicate populates duplicateActiveUntil ---
  const dupAck = await new Promise((resolve) => socket.emit('castCreateDuplicate', undefined, resolve));
  console.log('castCreateDuplicate ack:', JSON.stringify(dupAck));
  await new Promise((r) => setTimeout(r, 300));
  check(
    `duplicateActiveUntil is set after casting (got ${latestPlayer?.duplicateActiveUntil})`,
    typeof latestPlayer?.duplicateActiveUntil === 'number' && latestPlayer.duplicateActiveUntil > Date.now()
  );

  // --- Item 7: give-to-follower rejects non-equippable items ---
  // Give the character a mana crystal + a cloth armor (equippable, torso
  // slot) and a pet to give to.
  socket.close();
  // The disconnect's own handleDisconnect persists whatever position was
  // LIVE in memory (see game.gateway.ts) — waiting for it to actually
  // finish before the SQL update below runs avoids a race where that
  // persist fires AFTER (and clobbers) the manual position change.
  await new Promise((r) => setTimeout(r, 400));
  psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6 WHERE username='${CHAR}';`);
  const { token: charToken2 } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket2 = await connect(charToken2);
  socket2.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 500));
  const buyAck = await new Promise((resolve) => socket2.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'kitten' }, resolve));
  console.log('buyItem ack:', JSON.stringify(buyAck));
  check('bought a kitten for item 7 test', buyAck.ok);
  socket2.close();
  await new Promise((r) => setTimeout(r, 400));
  psql(`UPDATE players SET inventory='["lesser mana crystal", "cloth armor"]' WHERE username='${CHAR}';`);
  const { token: charToken3 } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket3 = await connect(charToken3);
  await new Promise((r) => setTimeout(r, 500));

  const crystalGiveAck = await new Promise((resolve) => socket3.emit('giveFollowerItem', { followerKind: 'pet', itemIndex: 0 }, resolve));
  console.log('give mana crystal ack:', JSON.stringify(crystalGiveAck));
  check('giving a mana crystal to a follower is rejected', crystalGiveAck.ok === false);

  const armorGiveAck = await new Promise((resolve) => socket3.emit('giveFollowerItem', { followerKind: 'pet', itemIndex: 1 }, resolve));
  console.log('give cloth armor ack:', JSON.stringify(armorGiveAck));
  check('giving cloth armor (torso slot) to a follower succeeds', armorGiveAck.ok === true);

  // --- Item 3: corpse loot ownership restriction ---
  const { token: accountToken2 } = await post('/auth/register', { username: UNAME2, email: EMAIL2, password: 'testpass123' });
  await post('/characters', { name: CHAR2, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken2);
  psql(`UPDATE players SET "row"=63, col=41, map='Grimoak Grounds', skills='{"punch": 100}' WHERE username='${CHAR2}';`);
  socket3.close();
  await new Promise((r) => setTimeout(r, 400));
  psql(`UPDATE players SET "row"=63, col=40, map='Grimoak Grounds' WHERE username='${CHAR}';`);

  const { token: charTokenA } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socketA = await connect(charTokenA);
  let mapStateA = null;
  socketA.on('map:state', (data) => (mapStateA = data));
  await new Promise((r) => setTimeout(r, 800));

  // Player A kills a nearby imp to produce a corpse killedBy=CHAR.
  const nearImp = mapStateA?.monsters?.find((m) => m.kind === 'imp' && !m.isRare);
  check('an imp is present for the loot-ownership test', Boolean(nearImp));
  if (nearImp) {
    socketA.close();
    await new Promise((r) => setTimeout(r, 400));
    // It's a patroller (see MonsterManagerService's stepPatrol), so the
    // position captured above may already be stale by the time each
    // reconnect actually lands — reposition against its CURRENT spot,
    // reconnecting again if it moved, up to a few tries.
    let socketA2 = null;
    let imp = nearImp;
    for (let attempt = 0; attempt < 4; attempt++) {
      psql(`UPDATE players SET "row"=${imp.row}, col=${imp.col + 1}, hp=500, max_hp=500 WHERE username='${CHAR}';`);
      const { token } = await post(`/characters/${CHAR}/select`, {}, accountToken);
      socketA2 = await connect(token);
      socketA2.on('map:state', (data) => (mapStateA = data));
      await new Promise((r) => setTimeout(r, 500));
      const fresh = mapStateA?.monsters?.find((m) => m.id === nearImp.id);
      if (!fresh) break;
      if (fresh.row === imp.row && fresh.col === imp.col) break; // settled, still where we placed the player
      imp = fresh;
      socketA2.close();
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('final imp position:', `(${imp.row},${imp.col})`, 'player at', `(${imp.row},${imp.col + 1})`);
    // Kill it with repeated punches (imp has 30 hp, punch deals a few
    // per hit at 100% skill — loop enough times to be sure, checking hp
    // directly rather than just presence since the corpse spawns at the
    // SAME instant the monster is removed from map:state).
    for (let i = 0; i < 30; i++) {
      socketA2.emit('engageMelee', { targetKind: 'monster', targetId: nearImp.id });
      socketA2.emit('punch', 'west');
      await new Promise((r) => setTimeout(r, 300));
      const current = mapStateA?.monsters?.find((m) => m.id === nearImp.id);
      if (i % 5 === 0) console.log(`t=${i * 300}ms imp:`, current ? `hp=${current.hp} pos=(${current.row},${current.col})` : 'gone');
      if (!current) break;
    }
    await new Promise((r) => setTimeout(r, 500));
    const corpse = mapStateA?.corpses?.find((c) => c.killedBy === CHAR);
    check('a corpse killed by CHAR exists', Boolean(corpse));
    socketA2.close();

    if (corpse) {
      // Player B (who did NOT kill it) tries to loot it.
      psql(`UPDATE players SET "row"=${corpse.row}, col=${corpse.col + 1}, map='Grimoak Grounds' WHERE username='${CHAR2}';`);
      const { token: charTokenB } = await post(`/characters/${CHAR2}/select`, {}, accountToken2);
      const socketB = await connect(charTokenB);
      await new Promise((r) => setTimeout(r, 500));
      const lootAck = await new Promise((resolve) => socketB.emit('loot', corpse.id, resolve));
      console.log('loot ack (not the killer):', JSON.stringify(lootAck));
      check("looting another player's kill is rejected", lootAck.ok === false && /another player/.test(lootAck.message ?? ''));
      socketB.close();
    }
  }
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(
      `DELETE FROM players WHERE username IN ('${CHAR}', '${CHAR2}'); DELETE FROM accounts WHERE username IN ('${UNAME}', '${UNAME2}');`
    );
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
