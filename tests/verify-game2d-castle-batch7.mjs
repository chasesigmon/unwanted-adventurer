// Live verification for this batch: lucem's max-of-all-sources light fix
// + 25% bigger radius + mana costs, the canteen item + drink/pour/irrigo
// mechanics, the shrunk Entrance Hall, and the castle's now-full-perimeter
// static light sources.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch7.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { getMap } from '../game2d/dist/shared/maps.js';
import { LUCEM_LIGHT_RADIUS_TILES, staticLightRadiusAt } from '../game2d/dist/shared/lighting.js';
import { CANTEEN_ITEM, CANTEEN_CAPACITY } from '../game2d/dist/shared/items.js';
import { LUCEM_BOOK_POSITION, IRRIGO_BOOK_MAP, IRRIGO_BOOK_POSITION } from '../game2d/dist/shared/spells.js';

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

async function main() {
  // === Static checks ===
  assert(LUCEM_LIGHT_RADIUS_TILES === 5, 'lucem radius is 4 * 1.25 = 5 (25% bigger than a torch)');

  const entrance = getMap('Grimoak Entrance Hall');
  console.log('  Entrance Hall size ->', entrance.rows, 'x', entrance.cols);
  assert(entrance.rows === 36 && entrance.cols === 53, 'Entrance Hall is 36x53 (25% smaller than the old 48x70)');

  // Castle light now reaches the BACK of the building, not just the front.
  const backRadius = staticLightRadiusAt('Grimoak Grounds', 20, 40); // well north of the door, near the castle's back
  console.log('  light radius near the back of the castle ->', backRadius);
  assert(backRadius !== null && backRadius > 0, 'the castle now lights up its own back side too');

  // === Live account/character/socket flow ===
  const email = `gsept${randomLetters(6)}@example.com`;
  const acctUsername = `Gsept${randomLetters(5)}`;
  const charName = `Gsepta${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'female', hairColor: 'blonde', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);

  // === Canteen given on creation ===
  console.log('  starting inventory ->', sync.player.inventory, 'canteenDrinks ->', sync.player.canteenDrinks);
  assert(sync.player.inventory.includes(CANTEEN_ITEM), 'new character starts with a canteen');
  assert(sync.player.canteenDrinks === CANTEEN_CAPACITY, `canteen starts full (${CANTEEN_CAPACITY} drinks)`);

  // === Drink/pour (granted skills, no podium needed) ===
  assert(sync.player.skills.drink !== undefined, 'new character starts knowing the drink skill');
  assert(sync.player.skills['pour out'] !== undefined, 'new character starts knowing the pour out skill');

  const canteenIndex = sync.player.inventory.indexOf(CANTEEN_ITEM);
  const drinkAck = await emitWithAck(socket, 'drinkItem', canteenIndex);
  console.log('  drink ->', drinkAck);
  assert(drinkAck.ok && drinkAck.canteenDrinks === CANTEEN_CAPACITY - 1, 'drinking removes exactly one charge');

  const pourAck = await emitWithAck(socket, 'pourItem', canteenIndex);
  console.log('  pour ->', pourAck);
  assert(pourAck.ok && pourAck.canteenDrinks === 0, 'pouring empties the canteen regardless of how much was left');

  // === Old use/consume flow refuses the canteen (item 7's safety guard) ===
  const useAck = await emitWithAck(socket, 'useItem', canteenIndex);
  console.log('  useItem on canteen ->', useAck);
  assert(!useAck.ok, 'the old click-to-use flow refuses to touch a fillable item');

  // === Irrigo: needs skill + wand; grant both directly to test deterministically ===
  sql(`UPDATE players SET skills = skills || '{"irrigo": 1}'::jsonb, mana=100, max_mana=100 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s2, sync: sync2 } = await connectSocket(select.body.token);
  const canteenIndex2 = sync2.player.inventory.indexOf(CANTEEN_ITEM);

  const irrigoNoWandAck = await emitWithAck(s2, 'castIrrigo', canteenIndex2);
  console.log('  irrigo with no wand equipped ->', irrigoNoWandAck);
  assert(!irrigoNoWandAck.ok, 'casting irrigo without a wand equipped is refused');

  // Equipping the wand splices it out of the inventory array, shifting
  // every later index down by one — re-resolve the canteen's index fresh
  // afterward (exactly the staleness a real client avoids by targeting
  // items by name, not a captured index — see WorldScene's
  // targetItemName).
  const equipAck = await emitWithAck(s2, 'useItem', sync2.player.inventory.indexOf('wand'));
  const canteenIndexAfterEquip = equipAck.inventory.indexOf(CANTEEN_ITEM);
  const manaBefore = sync2.player.mana;
  const irrigoAck = await emitWithAck(s2, 'castIrrigo', canteenIndexAfterEquip);
  console.log('  irrigo (canteen empty from earlier pour) ->', irrigoAck);
  assert(irrigoAck.ok && irrigoAck.canteenDrinks === CANTEEN_CAPACITY, 'irrigo fills the empty canteen back to full');
  assert(irrigoAck.mana === manaBefore - 10, 'irrigo costs exactly 10 mana');

  const irrigoAgainAck = await emitWithAck(s2, 'castIrrigo', canteenIndexAfterEquip);
  console.log('  irrigo on an already-full canteen ->', irrigoAgainAck);
  assert(irrigoAgainAck.ok, 'casting irrigo on a full canteen still succeeds as an attempt');
  assert(/already full/.test(irrigoAgainAck.message ?? ''), 'the message says the canteen is already full and cannot be filled');

  // === Irrigo podium position matches Utilization's (centered) ===
  assert(IRRIGO_BOOK_POSITION.col === LUCEM_BOOK_POSITION.col, 'the irrigo podium is centered the same way the lucem one is');
  const elementalCasting = getMap(IRRIGO_BOOK_MAP);
  assert(IRRIGO_BOOK_POSITION.col === Math.floor(elementalCasting.cols / 2), 'the irrigo podium column matches Elemental Casting\'s own center');

  // === Lucem's own mana cost (item 3's follow-up ask) ===
  sql(`UPDATE players SET skills = skills || '{"lucem": 1}'::jsonb, mana=5 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3 } = await connectSocket(select.body.token);
  const notEnoughManaMsg = new Promise((resolve) => s3.once('chat', resolve));
  s3.emit('chat', '/lucem');
  const notEnoughMana = await notEnoughManaMsg;
  console.log('  cast /lucem with only 5 mana ->', notEnoughMana.message);
  assert(/enough mana/.test(notEnoughMana.message), 'casting lucem with less than 10 mana is refused');
  s3.close();

  sql(`UPDATE players SET mana=50 WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s4 } = await connectSocket(select.body.token);
  const syncAfterLucemOn = new Promise((resolve) => s4.once('sync', resolve));
  s4.emit('chat', '/lucem');
  const { player: afterLucemOn } = await syncAfterLucemOn;
  console.log('  after casting lucem with 50 mana -> wandLit:', afterLucemOn.wandLit, 'mana:', afterLucemOn.mana);
  assert(afterLucemOn.wandLit === true, 'lighting the wand succeeds with enough mana');
  assert(afterLucemOn.mana === 40, 'lighting the wand costs exactly 10 mana (50 -> 40)');

  const syncAfterLucemOff = new Promise((resolve) => s4.once('sync', resolve));
  s4.emit('chat', '/lucem');
  const { player: afterLucemOff } = await syncAfterLucemOff;
  console.log('  after casting lucem again -> wandLit:', afterLucemOff.wandLit, 'mana:', afterLucemOff.mana);
  assert(afterLucemOff.wandLit === false, 'casting again turns it back off');
  assert(afterLucemOff.mana === 40, 'turning the wand off costs no mana (still 40)');
  s4.close();

  s2.close();
  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
