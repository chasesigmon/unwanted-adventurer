// Item: "add a mechanic to opening a monster's corpse. If the player has
// any 'empty vial' in their inventory then they should have another
// option in the corpse modal of a monster to fill a vial with monster
// blood. If the player doesn't have any empty vials then that option
// should not appear at all" (client-side hidden-not-greyed, verified by
// code review) -- this test covers the actual server mechanic: kills a
// real monster (level boosted for a guaranteed one/two-hit kill), fills a
// vial from its corpse, confirms the swap (empty vial -> filled vial) and
// that the corpse's own loot is untouched, then confirms the action is
// rejected once no empty vial remains, and that neither vial item can be
// destroyed via the ordinary click-to-use path.
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
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const CHAR = 'Vl' + randomLetters(8);
const UNAME = ('Vl' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Level 60 + a sword guarantees a one/two-hit kill against any early
// monster so this test doesn't depend on combat RNG to ever land.
psql(`UPDATE players SET map='Grimoak Grounds', "row"=80, col=20, level=60, hp=500, max_hp=500, strength=50, equipment = equipment || '{"weapon": "sword"}'::jsonb, inventory = inventory || '["empty vial"]'::jsonb WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket.on('map:state', (state) => {
    if (state.monsters?.length > 0) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});
if (!mapState) throw new Error('no monster found nearby');
let monster = mapState.monsters[0];
let bestDist = Math.abs(monster.row - 80) + Math.abs(monster.col - 20);
for (const m of mapState.monsters) {
  const d = Math.abs(m.row - 80) + Math.abs(m.col - 20);
  if (d < bestDist) {
    bestDist = d;
    monster = m;
  }
}
console.log('closest monster:', monster.kind, monster.id, 'at', monster.row, monster.col, `(distance ${bestDist})`);
socket.close();
await new Promise((r) => setTimeout(r, 300));

psql(`UPDATE players SET "row"=${monster.row}, col=${monster.col - 1} WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);

let corpse = null;
socket2.on('map:state', (state) => {
  const found = (state.corpses ?? []).find((c) => c.killedBy === CHAR);
  if (found) corpse = found;
});
socket2.emit('punch', 'east');
for (let i = 0; i < 8 && !corpse; i++) {
  await new Promise((r) => setTimeout(r, 3200));
  if (!corpse) socket2.emit('punch', 'east');
}
check('killed the monster and it left a corpse', corpse !== null, 'monster never died within the attempt window');

if (corpse) {
  console.log('corpse:', JSON.stringify(corpse));
  const originalCorpseItems = [...corpse.items];

  const fillAck = await new Promise((resolve, reject) =>
    socket2.timeout(5000).emit('fillVialFromCorpse', corpse.id, (err, res) => (err ? reject(err) : resolve(res)))
  );
  console.log('fillVialFromCorpse ack:', JSON.stringify(fillAck));
  check('filling the vial succeeded', fillAck.ok === true, JSON.stringify(fillAck));
  check('the empty vial became a filled vial (swapped, not just added)', fillAck.inventory?.includes('vial of monster blood') && !fillAck.inventory?.includes('empty vial'), JSON.stringify(fillAck.inventory));

  const dbInventory = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${CHAR}';"`).toString().trim());
  check('the swap actually persisted to the DB', dbInventory.includes('vial of monster blood') && !dbInventory.includes('empty vial'), JSON.stringify(dbInventory));

  // Filling the vial should NOT have touched the corpse's own lootable items.
  const stillLootAck = await new Promise((resolve, reject) =>
    socket2.timeout(5000).emit('loot', corpse.id, (err, res) => (err ? reject(err) : resolve(res)))
  );
  check(
    "the corpse's own loot was untouched by filling the vial",
    stillLootAck.ok === true && originalCorpseItems.every((item) => stillLootAck.inventory?.includes(item)),
    JSON.stringify({ stillLootAck, originalCorpseItems })
  );

  // No empty vial left -- the action should now be rejected.
  const noVialAck = await new Promise((resolve, reject) =>
    socket2.timeout(5000).emit('fillVialFromCorpse', corpse.id, (err, res) => (err ? reject(err) : resolve(res)))
  );
  check("filling again with no empty vial left is rejected", noVialAck.ok === false, JSON.stringify(noVialAck));

  // Neither vial item should be destroyable via the ordinary click-to-use
  // path (useItem/consumeItem) -- give one of each back and try both.
  psql(`UPDATE players SET inventory = inventory || '["empty vial", "vial of monster blood"]'::jsonb WHERE username='${CHAR}';`);
  socket2.close();
  await new Promise((r) => setTimeout(r, 300));
  const socket3 = await connect(charToken);
  const invRow = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${CHAR}';"`).toString().trim();
  const inv = JSON.parse(invRow);
  const emptyIdx = inv.indexOf('empty vial');
  const filledIdx = inv.indexOf('vial of monster blood');
  const useEmptyAck = await new Promise((resolve, reject) => socket3.timeout(5000).emit('useItem', emptyIdx, (err, res) => (err ? reject(err) : resolve(res))));
  check('clicking an empty vial to "use" it is rejected (not silently destroyed)', useEmptyAck.ok === false, JSON.stringify(useEmptyAck));
  const useFilledAck = await new Promise((resolve, reject) => socket3.timeout(5000).emit('useItem', filledIdx, (err, res) => (err ? reject(err) : resolve(res))));
  check('clicking a filled vial to "use" it is rejected (not silently destroyed)', useFilledAck.ok === false, JSON.stringify(useFilledAck));

  socket3.close();
} else {
  socket2.close();
}

psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);

process.exit(failures > 0 ? 1 : 0);
