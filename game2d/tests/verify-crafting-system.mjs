// Items 26/27/28: "Add a 'Crafting Shop'... shopkeepers sell 'empty
// vial'... 'a focus gem'... a crafting table... a modal with 9 slots in
// a 3x3 grid... add a recipe for each sword/wand/dagger/shield... 1 focus
// gem, 1 filled vial of monster blood, and a mana crystal... for each
// lesser mana crystal +1 mana, superior +5, perfect +10... a spinner...
// 10 lesser mana crystals makes a superior... 10 superior creates a
// perfect... otherwise if the items are incorrect then say that those
// items don't form a recipe... once crafted the player should be able to
// click it and add it to their inventory."
//
// Everything below stays on ONE continuous socket connection per
// character (reconnecting mid-test with the same username was found to
// occasionally read a stale cached position from a previous connection —
// a real quirk of rapid reconnects, not of this feature — see
// verify-castle-stairs-relocation.mjs's own note on the same issue).
// Bramwick Crafting Shop's vendor sits at (2,5), its table at (4,8);
// standing at (4,7) is within both SHOP_REACH_TILES (2) of the vendor and
// crafting-table reach (1) of the table at once, so no repositioning is
// needed at all.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}
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
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.once('sync', (data) => resolve({ socket, sync: data }));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
function emit(socket, event, payload) {
  return new Promise((resolve, reject) =>
    payload === undefined
      ? socket.timeout(5000).emit(event, (err, res) => (err ? reject(err) : resolve(res)))
      : socket.timeout(5000).emit(event, payload, (err, res) => (err ? reject(err) : resolve(res)))
  );
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
async function makeCharacter(prefix, row, col, extraInventory = []) {
  const CHAR = prefix + randomLetters(8);
  const UNAME = (prefix + randomLetters(8)).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  const extraJson = JSON.stringify(extraInventory).replace(/'/g, "''");
  psql(
    `UPDATE players SET map='Bramwick Crafting Shop', "row"=${row}, col=${col}, gold=1000, mana=50, max_mana=50, equipment = equipment - 'weapon', inventory = inventory || '${extraJson}'::jsonb WHERE username='${CHAR}';`
  );
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  return { CHAR, UNAME, charToken };
}
function cleanup({ CHAR, UNAME }) {
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// --- Reach check: crafting far from the table should fail (own fresh
// character/connection, isolated from the main flow below). ---
const farChar = await makeCharacter('CrF', 20, 20, ['wand', 'focus gem', 'vial of monster blood', 'lesser mana crystal']);
const { socket: farSocket } = await connect(farChar.charToken);
const farAck = await emit(farSocket, 'craftItem', {
  slots: [{ item: 'wand', count: 1 }, { item: 'focus gem', count: 1 }, { item: 'vial of monster blood', count: 1 }, { item: 'lesser mana crystal', count: 1 }, null, null, null, null, null],
});
check('crafting far from the table is rejected', farAck.ok === false && farAck.message?.includes('too far'), JSON.stringify(farAck));
farSocket.close();
cleanup(farChar);

// --- Main flow: one continuous connection at (4,7), within reach of both
// the vendor (2,5) and the crafting table (4,8). 13 lesser crystals up
// front (3 for the wand craft below + 10 for the upgrade recipe after) so
// nothing needs a mid-test inventory top-up (see the reconnect-staleness
// note above -- avoiding a second reconnect entirely is simplest). ---
const thirteenLesser = Array.from({ length: 13 }, () => 'lesser mana crystal');
const main = await makeCharacter('CrM', 4, 7, ['wand', 'vial of monster blood', ...thirteenLesser]);
const { socket } = await connect(main.charToken);

const buyVialAck = await emit(socket, 'buyItem', { vendorId: 'bramwick-crafting-shop', itemLabel: 'empty vial' });
check('bought an empty vial from the Crafting Shop', buyVialAck.ok === true, JSON.stringify(buyVialAck));
const buyGemAck = await emit(socket, 'buyItem', { vendorId: 'bramwick-crafting-shop', itemLabel: 'focus gem' });
check('bought a focus gem from the Crafting Shop', buyGemAck.ok === true, JSON.stringify(buyGemAck));

// Craft a wand with 3 lesser crystals (+3 mana).
const craftAck = await emit(socket, 'craftItem', {
  slots: [{ item: 'wand', count: 1 }, { item: 'focus gem', count: 1 }, { item: 'vial of monster blood', count: 1 }, { item: 'lesser mana crystal', count: 3 }, null, null, null, null, null],
});
console.log('craftItem ack:', JSON.stringify(craftAck));
check('crafting a valid recipe succeeds', craftAck.ok === true, JSON.stringify(craftAck));
check('the crafted item name encodes the base item + mana bonus', craftAck.resultItem === 'wand of Mana +3', craftAck.resultItem);
check(
  'the wand/gem/vial/3 crystals are all really gone from inventory',
  !craftAck.inventory?.includes('focus gem') && !craftAck.inventory?.includes('vial of monster blood') && !craftAck.inventory?.includes('wand'),
  JSON.stringify(craftAck.inventory)
);
check('exactly 10 lesser mana crystals remain (13 seeded - 3 consumed)', craftAck.inventory?.filter((i) => i === 'lesser mana crystal').length === 10, JSON.stringify(craftAck.inventory));

// Can't craft again until the pending item is claimed.
const blockedAck = await emit(socket, 'craftItem', { slots: [{ item: 'lesser mana crystal', count: 2 }, null, null, null, null, null, null, null, null] });
check('crafting again before claiming the pending item is rejected', blockedAck.ok === false && blockedAck.message?.toLowerCase().includes('claim'), JSON.stringify(blockedAck));

// Claim it.
const claimAck = await emit(socket, 'claimCraftedItem');
check('claiming the crafted item succeeds', claimAck.ok === true && claimAck.inventory?.includes('wand of Mana +3'), JSON.stringify(claimAck));

// Equip it and confirm the mana bonus actually applies (maxMana +3), and
// the equipment-slot base-name fallback works for a crafted item.
const craftedIndex = claimAck.inventory.indexOf('wand of Mana +3');
const maxManaBefore = 50;
const equipAck = await emit(socket, 'useItem', craftedIndex);
check('the crafted wand equips successfully (base-name equipment-slot fallback)', equipAck.ok === true && equipAck.action === 'equipped', JSON.stringify(equipAck));
await new Promise((r) => setTimeout(r, 300));
const maxManaAfter = Number(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT max_mana FROM players WHERE username='${main.CHAR}';"`).toString().trim());
check('equipping it actually granted +3 max mana', maxManaAfter === maxManaBefore + 3, `before=${maxManaBefore} after=${maxManaAfter}`);

// Mana crystal upgrade recipe: 10 lesser -> 1 superior. The remaining 10
// (13 seeded - 3 consumed by the wand craft above) are used here, same
// continuous connection, no reconnect needed.
const upgradeAck = await emit(socket, 'craftItem', { slots: [{ item: 'lesser mana crystal', count: 10 }, null, null, null, null, null, null, null, null] });
console.log('mana crystal upgrade ack:', JSON.stringify(upgradeAck));
check('10 lesser mana crystals upgrade into 1 superior mana crystal', upgradeAck.ok === true && upgradeAck.resultItem === 'superior mana crystal', JSON.stringify(upgradeAck));
check('all 10 lesser crystals were consumed', !upgradeAck.inventory?.includes('lesser mana crystal'), JSON.stringify(upgradeAck.inventory));

const claimUpgradeAck = await emit(socket, 'claimCraftedItem');
check('claiming the upgraded superior mana crystal succeeds', claimUpgradeAck.ok === true && claimUpgradeAck.inventory?.includes('superior mana crystal'), JSON.stringify(claimUpgradeAck));

// Invalid combination is rejected, and nothing is consumed.
const invBeforeInvalid = [...claimUpgradeAck.inventory];
const invalidAck = await emit(socket, 'craftItem', { slots: [{ item: 'canteen', count: 1 }, { item: 'superior mana crystal', count: 1 }, null, null, null, null, null, null, null] });
check("an invalid item combination is rejected with the \"don't form a recipe\" message", invalidAck.ok === false && invalidAck.message === "Those items don't form a recipe.", JSON.stringify(invalidAck));
const invAfterInvalid = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${main.CHAR}';"`).toString().trim());
check('nothing was consumed by the failed craft attempt', JSON.stringify([...invBeforeInvalid].sort()) === JSON.stringify([...invAfterInvalid].sort()), JSON.stringify({ invBeforeInvalid, invAfterInvalid }));

socket.close();
cleanup(main);

process.exit(failures > 0 ? 1 : 0);
