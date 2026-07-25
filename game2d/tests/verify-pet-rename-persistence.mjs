// Item 24: "give the player the ability to name their pet or tamed beast
// and it should persist." PetSnapshot.name/TamedBeastSnapshot.name were
// already mutable fields (set to a default label at buy time) -- this adds
// the actual rename socket handlers (renamePet/renameTamedBeast,
// game.gateway.ts) plus PetManagerService.rename/TamedBeastManagerService.rename,
// piggybacking on the existing persistStats path (pet/tamedBeast columns).
//
// This test seeds a pet + tamed beast directly into Postgres (mirroring
// PetManagerService.restore's own expected shape), connects (triggering
// restore()), renames both over the socket, disconnects, then reads the
// DB rows straight back to confirm the new names survived without ever
// reconnecting through the game socket again -- persistStats itself is
// what's under test, not the in-memory restore path a second time.
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

const CHAR = 'Pn' + randomLetters(8);
const UNAME = ('Pn' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

const pet = { id: 'test-pet-1', ownerUsername: CHAR, kind: 'puppy', name: 'Puppy', level: 1, exp: 0, hp: 50, maxHp: 50, map: 'Grimoak Grounds', row: 80, col: 20, command: 'follow', inventory: [], equipment: {}, alive: true, size: 'small' };
const beast = { id: 'test-beast-1', ownerUsername: CHAR, kind: 'wild goblin', name: 'Tamed wild goblin', level: 1, hp: 30, maxHp: 30, attackDamage: 5, map: 'Grimoak Grounds', row: 80, col: 20, command: 'follow' };
psql(`UPDATE players SET pet = '${JSON.stringify(pet).replace(/'/g, "''")}'::jsonb, tamed_beast = '${JSON.stringify(beast).replace(/'/g, "''")}'::jsonb WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const petAck = await new Promise((resolve, reject) => {
  socket.timeout(5000).emit('renamePet', { name: 'Sir Barksalot' }, (err, res) => (err ? reject(err) : resolve(res)));
});
console.log('renamePet ack:', JSON.stringify(petAck));
check('renamePet succeeded', petAck.ok === true, JSON.stringify(petAck));
check('the ack reflects the new pet name immediately', petAck.pet?.name === 'Sir Barksalot', petAck.pet?.name);

const beastAck = await new Promise((resolve, reject) => {
  socket.timeout(5000).emit('renameTamedBeast', { name: 'Grumbly' }, (err, res) => (err ? reject(err) : resolve(res)));
});
console.log('renameTamedBeast ack:', JSON.stringify(beastAck));
check('renameTamedBeast succeeded', beastAck.ok === true, JSON.stringify(beastAck));
check('the ack reflects the new tamed beast name immediately', beastAck.tamedBeast?.name === 'Grumbly', beastAck.tamedBeast?.name);

// A blank/whitespace-only name should be rejected, not silently accepted.
const blankAck = await new Promise((resolve, reject) => {
  socket.timeout(5000).emit('renamePet', { name: '   ' }, (err, res) => (err ? reject(err) : resolve(res)));
});
check('a blank name is rejected', blankAck.ok === false, JSON.stringify(blankAck));

socket.close();
await new Promise((r) => setTimeout(r, 500)); // let the fire-and-forget persistStats calls actually land

const row = execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT pet->>'name', tamed_beast->>'name' FROM players WHERE username='${CHAR}';"`).toString();
console.log('DB row after disconnect (pet name | beast name):', row.trim());
check('the new pet name actually persisted to the DB (survives without the in-memory manager)', row.includes('Sir Barksalot'), row);
check('the new tamed beast name actually persisted to the DB', row.includes('Grumbly'), row);

psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);

process.exit(failures > 0 ? 1 : 0);
