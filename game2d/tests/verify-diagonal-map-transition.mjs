// Item 14: "Diagonal movement from Kortho into Direfell caused a visual
// glitch (appeared in Kortho next to shops, then snapped to Direfell on
// next move)." Root cause: attemptDiagonalMove (client/game/WorldScene.ts)
// never checked ack.player.map !== this.currentMap the way the ordinary
// cardinal-move handler does, so a transitioning diagonal step never
// called renderMap — this is a SERVER-side confirmation that the
// transition itself resolves correctly (map='Direfell'), which the client
// fix (mirroring attemptMove's own map-transition branch) now also
// renders immediately instead of showing a stale Kortho view.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'DiagChk' + Math.floor(Math.random() * 10000);
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
function emit(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, (res) => resolve(res)));
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
// Exactly on Kortho's own Kortho->Direfell exit tile (row 15, col 105,
// the map's last column) -- the transition fires when moving FROM this
// tile with an east component (see resolveDiagonalMove).
psql(`UPDATE players SET map='Kortho', "row"=15, col=105 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const ack = await emit(socket, 'moveDiagonal', { dRow: -1, dCol: 1 });
check('diagonal step from the exit tile transitions to Direfell', ack.ok === true && ack.player?.map === 'Direfell', JSON.stringify({ ok: ack.ok, map: ack.player?.map }));
check('the ack carries a mapState payload for the client to render immediately', ack.mapState !== undefined, JSON.stringify(Object.keys(ack)));

socket.close();
process.exit(failures > 0 ? 1 : 0);
