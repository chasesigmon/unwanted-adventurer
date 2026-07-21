// Item 9: "While druid has wisp transformation active (flight is
// possible), also add a flight AFFECT matching wisp transformation's own
// time limit." The actual fix is client-side only (affectsPanel.ts now
// synthesizes a 'Flight' row off wispActiveUntil, on top of the existing
// 'Wisp Transformation' row) -- deliberately NOT touching the server's
// real flightActive/flightActiveUntil fields, specifically so it can't
// clobber an independently-cast real Flight spell's own duration. This
// verifies that safety property directly: casting wisp transformation
// sets wispActive/wispActiveUntil but leaves flightActive/
// flightActiveUntil completely untouched server-side.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'WispChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Wp' + randomLetters(8);

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
// Give the character the wisp transformation skill + plenty of mana so
// the cast doesn't get rejected for either reason.
psql(`UPDATE players SET skills = skills || '{"wisp transformation": 80}'::jsonb, mana = 100 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const beforeCast = await emit(socket, 'move', 'east'); // just to get a fresh snapshot shape
check('setup move succeeded (wand equipped by default)', beforeCast?.ok === true, JSON.stringify(beforeCast));

const castAck = await emit(socket, 'castWispTransformation');
console.log('cast ack:', JSON.stringify(castAck));
check('wisp transformation cast succeeded', castAck?.ok === true, JSON.stringify(castAck));

// CastSpellAck carries no player snapshot of its own -- a subsequent move
// ack does (same pattern verify-crystal-wyvern.mjs and friends rely on).
await new Promise((r) => setTimeout(r, 250));
const afterCastMove = await emit(socket, 'move', 'west');
const player = afterCastMove.player;
check('wispActive is true after cast', player?.wispActive === true, JSON.stringify(player?.wispActive));
check('wispActiveUntil is set', typeof player?.wispActiveUntil === 'number' && player.wispActiveUntil > Date.now(), JSON.stringify(player?.wispActiveUntil));
check('flightActive is NOT touched by wisp (stays false)', player?.flightActive === false, JSON.stringify(player?.flightActive));
check('flightActiveUntil is NOT touched by wisp (stays null)', player?.flightActiveUntil === null, JSON.stringify(player?.flightActiveUntil));

socket.close();
process.exit(failures > 0 ? 1 : 0);
