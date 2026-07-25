// Item 5's bug: "I was wearing a wand and in the character sheet it showed
// the magic damage as 33 (1)... I removed the wand and the (1) bonus was
// gone. Then I equipped the wand again and the bonus did not re-appear."
//
// Root cause: UseItemAck never carried magicDamageBonus (or any other
// equipment-derived stat) -- only a full 'sync' payload does, and nothing
// forced one on equip/unequip. game.gateway.ts's finishItemAction now emits
// a fresh 'sync' on every equip/unequip/consume (see its own doc comment).
//
// This test equips a wand (magicDamageBonus should become 1), unequips it
// (back to 0), then re-equips it (back to 1) -- reading magicDamageBonus
// straight off each useItem/unequipItem call's own immediately-following
// 'sync' event, the exact sequence that used to leave it stale.
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
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
// Waits for the NEXT 'sync' after firing the given socket.emit call --
// finishItemAction's own fresh sync fires before the ack callback, but we
// only care that it arrives at all with the right value.
function nextSync(socket) {
  return new Promise((resolve) => socket.once('sync', (data) => resolve(data.player)));
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const CHAR = 'Mg' + randomLetters(8);
const UNAME = ('Mg' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Give the character a plain wand IN their inventory (not yet equipped) so
// the first useItem call is a real equip action, not a no-op.
psql(`UPDATE players SET inventory = inventory || '["wand"]'::jsonb WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

// Simplest reliable way to find the wand's inventory index: re-select via
// HTTP doesn't give inventory; read it back from Postgres directly instead.
const invRow = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${CHAR}';"`).toString();
const inventory = JSON.parse(invRow.trim());
const wandIndex = inventory.indexOf('wand');
check('the seeded wand is actually in the inventory', wandIndex !== -1, invRow);

// Equip it.
const syncAfterEquip = nextSync(socket);
socket.emit('useItem', wandIndex, () => {});
const afterEquip = await syncAfterEquip;
console.log('magicDamageBonus right after equipping the wand:', afterEquip.magicDamageBonus);
check('magicDamageBonus is 1 immediately after equipping the wand', afterEquip.magicDamageBonus === 1, `got ${afterEquip.magicDamageBonus}`);

// Unequip it.
const syncAfterUnequip = nextSync(socket);
socket.emit('unequipItem', 'weapon', () => {});
const afterUnequip = await syncAfterUnequip;
console.log('magicDamageBonus right after unequipping the wand:', afterUnequip.magicDamageBonus);
check('magicDamageBonus drops back to 0 immediately after unequipping', afterUnequip.magicDamageBonus === 0, `got ${afterUnequip.magicDamageBonus}`);

// Re-equip it -- this is the exact step that used to stay stuck at 0.
const invRow2 = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${CHAR}';"`).toString();
const inventory2 = JSON.parse(invRow2.trim());
const wandIndex2 = inventory2.indexOf('wand');
const syncAfterReequip = nextSync(socket);
socket.emit('useItem', wandIndex2, () => {});
const afterReequip = await syncAfterReequip;
console.log('magicDamageBonus right after RE-equipping the wand:', afterReequip.magicDamageBonus);
check('magicDamageBonus is back to 1 immediately after re-equipping (the actual reported bug)', afterReequip.magicDamageBonus === 1, `got ${afterReequip.magicDamageBonus}`);

socket.close();
psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);

process.exit(failures > 0 ? 1 : 0);
