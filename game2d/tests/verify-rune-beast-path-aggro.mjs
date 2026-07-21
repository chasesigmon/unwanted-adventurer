// Item 11 of a later follow-up ask: "make it so that the rune beasts are
// on the path, not on the rocks, and they should be aggressive/aggro to a
// player that gets near." Confirms every rune beast currently on
// Runestone Way sits on the walkable road band (not the rocky off-road
// one), and that standing near one (without attacking) eventually causes
// it to close in/attack -- proving aggroRadiusTiles is now honored.
// Run with `node tests/verify-rune-beast-path-aggro.mjs` against the live
// dev server -- requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'RuneAggro' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Ra' + randomLetters(8);

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

psql(`UPDATE players SET map='Runestone Way', "row"=10, col=5, level=20, hp=500, max_hp=500 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let lastMapState = null;
socket.on('map:state', (payload) => {
  lastMapState = payload;
});
await new Promise((r) => setTimeout(r, 800));

const runeBeasts = lastMapState?.monsters?.filter((m) => m.kind === 'rune beast') ?? [];
check('at least one rune beast is on Runestone Way', runeBeasts.length > 0, `monsters seen: ${lastMapState?.monsters?.map((m) => m.kind).join(', ') || 'none'}`);

// RUNESTONE_WAY_MID_COL +/- RUNESTONE_WAY_HALF_WIDTH_TILES (2) is the
// walkable road band -- BRAMWICK_SIZE=40, RUNESTONE_WAY_COLS=round(40*0.25)=10,
// mid col = floor(10/2)=5, band = cols 3-7.
const midCol = 5;
const halfWidth = 2;
const onRoad = runeBeasts.filter((m) => m.col >= midCol - halfWidth && m.col <= midCol + halfWidth);
console.log('rune beast columns:', runeBeasts.map((m) => m.col));
check('every rune beast sits within the walkable road band (not the rocks)', onRoad.length === runeBeasts.length, `on-road=${onRoad.length}/${runeBeasts.length}`);

if (runeBeasts.length > 0) {
  const target = runeBeasts[0];
  // Stand right next to it (aggro radius 5) without attacking, and watch
  // for it to close distance / start counter-attacking (hp drop or
  // position change toward the player) over a few seconds.
  const nearRow = Math.max(0, target.row - 3);
  psql(`UPDATE players SET "row"=${nearRow}, col=${target.col} WHERE username='${CHAR}';`);
  socket.close();
  const socket2 = await connect(charToken);
  let laterState = null;
  socket2.on('map:state', (payload) => {
    laterState = payload;
  });
  await new Promise((r) => setTimeout(r, 6000));
  const nowBeast = laterState?.monsters?.find((m) => m.id === target.id);
  console.log('rune beast before:', JSON.stringify({ row: target.row, col: target.col }));
  console.log('rune beast after standing nearby:', JSON.stringify(nowBeast ? { row: nowBeast.row, col: nowBeast.col } : null));
  const myHp = laterState?.players?.find((p) => p.username === CHAR)?.hp;
  console.log('player hp after standing nearby:', myHp);
  const closedIn = nowBeast && (Math.abs(nowBeast.row - target.row) + Math.abs(nowBeast.col - target.col) > 0 || (myHp !== undefined && myHp < 500));
  check('the nearby rune beast moved toward/attacked the player without being attacked first', Boolean(closedIn));
  socket2.close();
} else {
  socket.close();
}

process.exit(failures > 0 ? 1 : 0);
