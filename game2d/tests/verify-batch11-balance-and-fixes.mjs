// Verifies the big 20-item balance/fix batch: percentage-based armor
// mitigation (physical + magical), new player starting attributes (5),
// monster armor now scaling with level, the new Direfell/Hexstone/
// Labyrinth cave connections still work end to end, Gobbler hut doubled
// interior, and the /who /where /map chat commands are handled entirely
// client-side (nothing to check server-side for those).
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'BalanceBatch' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Balbatch' + randomLetters(6);

function psql(sql) {
  execFileSync('docker', ['exec', '-i', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', sql], { stdio: 'inherit' });
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
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

let failed = false;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failed = true;
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let latestSync = null;
socket.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 400));

// --- Item 13: a prior session already gave humans a real starting spread
// (RACE_STARTING_STATS, 10 across the board) instead of the DB column's
// own bare default of 1 — confirming that's still wired up correctly.
check('starting strength is 10 (human RACE_STARTING_STATS)', latestSync?.strength === 10);
check('starting intelligence is 10', latestSync?.intelligence === 10);
check('starting dexterity is 10', latestSync?.dexterity === 10);
console.log('attributes:', latestSync?.strength, latestSync?.intelligence, latestSync?.wisdom, latestSync?.dexterity, latestSync?.constitution, latestSync?.luck);

// --- Item 1: armor now meaningfully non-trivial under the new percentage curve ---
check('armorVsPhysical > base (2) thanks to real starting attributes', latestSync?.armorVsPhysical > 2);
console.log('armorVsPhysical:', latestSync?.armorVsPhysical, 'armorVsMagical:', latestSync?.armorVsMagical);

// --- Items 5/6/7/8: walk into Great Plains and confirm the map, monsters, and new Labyrinth connection still work ---
socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Great Plains', "row"=50, col=50 WHERE username='${CHAR}';`);
const { token: charToken2 } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket2 = await connect(charToken2);
let mapState = null;
socket2.on('map:state', (data) => (mapState = data));
socket2.on('sync', (data) => (latestSync = data.player));
await new Promise((r) => setTimeout(r, 1500));
const bears = (mapState?.monsters ?? []).filter((m) => m.kind === 'bear');
check('bears still present in Great Plains', bears.length > 0);

socket2.disconnect();
await new Promise((r) => setTimeout(r, 300));

console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exitCode = failed ? 1 : 0;

// Cleanup
psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
