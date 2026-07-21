// Item 6/7 (second half): "new creature 'Runestone Canyon Dweller' levels
// 18-20 inclusive... classify as 'beast'." Confirms via the server's own
// map:state broadcast that the species actually spawns in Runestone
// Canyon, with a level in the 18-20 range and monsterClass 'beast'.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'DwlChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Dc' + randomLetters(8);

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
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Runestone Canyon', "row"=25, col=25 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const mapState = await new Promise((resolve) => {
  socket.on('map:state', (state) => {
    if (state.monsters?.some((m) => m.kind === 'runestone canyon dweller')) resolve(state);
  });
  setTimeout(() => resolve(null), 5000);
});

check('map:state was received with at least one dweller', mapState !== null, 'no dweller appeared within 5s');
if (mapState) {
  const dwellers = mapState.monsters.filter((m) => m.kind === 'runestone canyon dweller');
  console.log(`found ${dwellers.length} dweller(s), levels: ${dwellers.map((d) => d.level).join(', ')}`);
  check('all dwellers are level 18-20', dwellers.every((d) => d.level >= 18 && d.level <= 20), JSON.stringify(dwellers.map((d) => d.level)));
  check('all dwellers are classified as beast', dwellers.every((d) => d.monsterClass === 'beast'), JSON.stringify(dwellers.map((d) => d.monsterClass)));
}

socket.close();
process.exit(failures > 0 ? 1 : 0);
