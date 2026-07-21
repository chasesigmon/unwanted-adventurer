// Item 3 of a later follow-up ask: "Add a 'Crystal Deer' to Silverbranch
// way... between levels 16 and 19 (up to and including 19)... Classify
// them as 'beast' (so druid can tame)."
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'DeerCheck' + Math.floor(Math.random() * 100000);
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
psql(`UPDATE players SET map='Silverbranch Road', "row"=5, col=80 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let lastMapState = null;
socket.on('map:state', (payload) => {
  lastMapState = payload;
});
await new Promise((r) => setTimeout(r, 800));

const deer = (lastMapState?.monsters ?? []).filter((m) => m.kind === 'crystal deer');
check('at least one crystal deer is on Silverbranch Road', deer.length > 0, `monsters seen: ${lastMapState?.monsters?.map((m) => m.kind).join(', ') || 'none'}`);
console.log('crystal deer levels seen:', deer.map((d) => d.level));
check('every crystal deer is level 16-19', deer.every((d) => d.level >= 16 && d.level <= 19), JSON.stringify(deer.map((d) => d.level)));

socket.close();
process.exit(failures > 0 ? 1 : 0);
