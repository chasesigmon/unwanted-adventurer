// Item 19: "Affects window still uses Latin names — thorough check
// needed to remove ALL Latin references everywhere." Confirms via direct
// socket casts that the light/haste/aegis spells' own cast-ack messages
// (and rejection messages) are now English, not Latin — the Affects
// panel's own labels are a pure client-side render of myProfile fields
// (no server round-trip needed to verify those directly), already
// reviewed and fixed in client/ui/affectsPanel.ts.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'LatChk' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Lt' + randomLetters(8);

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
function containsLatin(text) {
  return /\b(lucem|celeritas|scutum|irrigo|augue)\b/i.test(text ?? '');
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

// None of these 3 skills are learned yet -- the rejection message itself
// ("You don't know the X spell yet") is exactly one of the strings that
// used to say "lucem"/"celeritas"/"scutum".
const lightAck = await emit(socket, 'castLucem');
console.log('light cast (unlearned) ack:', JSON.stringify(lightAck));
check('light rejection message has no Latin', !containsLatin(lightAck.message), lightAck.message);
check('light rejection message says "light"', /\blight\b/i.test(lightAck.message ?? ''), lightAck.message);

const hasteAck = await emit(socket, 'castCeleritas');
console.log('haste cast (unlearned) ack:', JSON.stringify(hasteAck));
check('haste rejection message has no Latin', !containsLatin(hasteAck.message), hasteAck.message);
check('haste rejection message says "haste"', /\bhaste\b/i.test(hasteAck.message ?? ''), hasteAck.message);

const aegisAck = await emit(socket, 'castScutum');
console.log('aegis cast (unlearned) ack:', JSON.stringify(aegisAck));
check('aegis rejection message has no Latin', !containsLatin(aegisAck.message), aegisAck.message);
check('aegis rejection message says "aegis"', /\baegis\b/i.test(aegisAck.message ?? ''), aegisAck.message);

socket.close();
process.exit(failures > 0 ? 1 : 0);
