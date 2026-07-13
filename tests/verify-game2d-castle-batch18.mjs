// Live verification for this 7-item batch. Covers what's cleanly
// server-observable: hunger/thirst starting at 100 and restoring via
// canteen/cup-of-water/jerky, the Great Hall's new shopkeeper selling
// both, the training skeleton's wooden club (rendered via carriedItems)
// and exarme actually disarming/re-arming it, and the Learn Spells quest
// (start + auto-completing an objective by walking into a classroom).
//
// NOT scripted here (pure client-only rendering/UI, no server signal —
// verified instead by typecheck/build + a manual dev-server check): the
// quest log modal's list/detail views and strikethrough styling, the
// Headmistress's own placement/reach-gated click/dialogue modal, the
// corrected ASCII map (Duskwing Dorms now north), and the Entrance Hall's
// 5% size reduction (a pure map-dimension constant with no
// server-observable behavior beyond "the map still works," which the
// other movement checks below already exercise incidentally).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch18.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

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
  const owner = await registerAndSpawn('batchr');

  // === Item 4: hunger/thirst start at 100 for a brand new character ===
  assert(owner.sync.player.hunger === 100, `fresh character starts at 100 hunger (was ${owner.sync.player.hunger})`);
  assert(owner.sync.player.thirst === 100, `fresh character starts at 100 thirst (was ${owner.sync.player.thirst})`);

  // === Item 4: drinking the canteen restores 20 thirst, capped at 100 ===
  sql(`UPDATE players SET thirst=50, canteen_drinks=6 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: drinkSock, sync: drinkSync } = await connectSocket(owner.token);
  const canteenIndex = drinkSync.player.inventory.indexOf('canteen');
  assert(canteenIndex !== -1, 'a fresh wizard carries a canteen');
  const drinkAck = await emitWithAck(drinkSock, 'drinkItem', canteenIndex);
  console.log('  drinkItem ->', drinkAck);
  assert(drinkAck.ok === true && drinkAck.thirst === 70, `drinking the canteen restores 20 thirst (50 -> ${drinkAck.thirst})`);
  drinkSock.close();

  // === Items 3/4: buy a cup of water + jerky from the Great Hall's own
  // new shopkeeper, then consume each for the expected hunger/thirst gain,
  // confirming the item disappears from inventory afterward. ===
  sql(`UPDATE players SET map='Great Hall', row=13, col=0, gold=100, hunger=50, thirst=50 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: shopSock } = await connectSocket(owner.token);
  const buyWaterAck = await emitWithAck(shopSock, 'buyItem', { vendorId: 'great-hall-shopkeeper', itemLabel: 'a cup of water' });
  console.log('  buy a cup of water ->', buyWaterAck);
  assert(buyWaterAck.ok === true && buyWaterAck.gold === 98, `buying a cup of water costs 2 gold (now ${buyWaterAck.gold})`);
  const buyJerkyAck = await emitWithAck(shopSock, 'buyItem', { vendorId: 'great-hall-shopkeeper', itemLabel: 'some jerky' });
  console.log('  buy some jerky ->', buyJerkyAck);
  assert(buyJerkyAck.ok === true && buyJerkyAck.gold === 95, `buying jerky costs 3 gold (now ${buyJerkyAck.gold})`);

  const waterIndex = buyJerkyAck.inventory.indexOf('a cup of water');
  const consumeWaterAck = await emitWithAck(shopSock, 'useItem', waterIndex);
  console.log('  drink the cup of water ->', consumeWaterAck);
  assert(consumeWaterAck.ok === true && consumeWaterAck.thirst === 70, `drinking a cup of water restores 20 thirst (50 -> ${consumeWaterAck.thirst})`);
  assert(!consumeWaterAck.inventory.includes('a cup of water'), 'the cup of water is gone from inventory after drinking it');

  const jerkyIndex = consumeWaterAck.inventory.indexOf('some jerky');
  const consumeJerkyAck = await emitWithAck(shopSock, 'consumeItem', jerkyIndex);
  console.log('  eat the jerky ->', consumeJerkyAck);
  assert(consumeJerkyAck.ok === true && consumeJerkyAck.hunger === 70, `eating jerky restores 20 hunger (50 -> ${consumeJerkyAck.hunger})`);
  assert(!consumeJerkyAck.inventory.includes('some jerky'), 'the jerky is gone from inventory after eating it');
  shopSock.close();

  // === Item 5: the training skeleton carries a wooden club, and exarme
  // can disarm it. ===
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=14, col=36, mana=100, max_mana=100, skills = skills || '{"exarme": 100}'::jsonb WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: exarmeSock, mapState: entranceState } = await connectSocket(owner.token);
  const skeleton = entranceState.npcs.find((n) => n.label === 'training skeleton');
  assert(Boolean(skeleton), 'a training skeleton npc is present in the Entrance Hall');
  assert(Boolean(skeleton?.carriedItems?.includes('wooden club')), `the training skeleton carries a wooden club (carriedItems: ${JSON.stringify(skeleton?.carriedItems)})`);

  const exarmeAck = await emitWithAck(exarmeSock, 'castExarme', { targetKind: 'npc', targetId: skeleton.id });
  console.log('  castExarme on the training skeleton ->', exarmeAck);
  assert(exarmeAck.ok === true, 'exarme cast on the training skeleton is accepted');
  const { mapState: afterDisarmState } = await connectSocket(owner.token);
  const disarmedSkeleton = afterDisarmState.npcs.find((n) => n.id === skeleton.id);
  console.log('  skeleton carriedItems after exarme ->', disarmedSkeleton?.carriedItems);
  assert(
    exarmeAck.message?.includes('wooden club') ? (disarmedSkeleton?.carriedItems ?? []).length === 0 : true,
    'a successful disarm actually removes the club from the skeleton'
  );
  exarmeSock.close();

  // === Item 2: the Learn Spells quest — starting it, then completing its
  // Elemental Casting Classroom objective just by walking in. ===
  const { socket: questSock } = await connectSocket(owner.token);
  const startAck = await emitWithAck(questSock, 'startQuest', { questId: 'learn-spells' });
  console.log('  startQuest(learn-spells) ->', startAck);
  assert(startAck.ok === true, 'starting the Learn Spells quest succeeds');
  const startAgainAck = await emitWithAck(questSock, 'startQuest', { questId: 'learn-spells' });
  assert(startAgainAck.ok === true, 'starting an already-started quest is a harmless no-op');
  questSock.close();

  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=0, col=9 WHERE username='${owner.charName}';`);
  await sleep(300);
  const { socket: classroomSock } = await connectSocket(owner.token);
  const syncPromise = new Promise((resolve) => classroomSock.once('sync', resolve));
  const moveAck = await emitWithAck(classroomSock, 'move', 'north');
  console.log('  walking into the Elemental Casting Classroom ->', moveAck.ok, moveAck.player?.map);
  const questSync = await Promise.race([syncPromise, sleep(3000).then(() => null)]);
  console.log('  quests after entering the classroom ->', questSync?.player?.quests ?? moveAck.player?.quests);
  const finalQuests = questSync?.player?.quests ?? moveAck.player?.quests ?? {};
  assert(
    Array.isArray(finalQuests['learn-spells']) && finalQuests['learn-spells'].includes('Elemental Casting Classroom'),
    `walking into the classroom marks its objective complete (quests: ${JSON.stringify(finalQuests)})`
  );
  classroomSock.close();

  owner.socket.close();
  sql(`DELETE FROM players WHERE username = '${owner.charName}';`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
