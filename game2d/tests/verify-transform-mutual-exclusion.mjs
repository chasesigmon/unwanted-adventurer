// Item 10 of a later follow-up ask: "prevent the druid from transforming
// into a beast while wisp transformed and vice versa, show a tooltip
// message and chat window message." Confirms both casts are now REJECTED
// (not silently swapped) when the other form is already active.
// Run with `node tests/verify-transform-mutual-exclusion.mjs` against the
// live dev server -- requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'MutEx' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Me' + randomLetters(8);

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

psql(
  `UPDATE players SET mana=200, max_mana=200, ` +
    `skills='{"punch":1,"wisp transformation":100,"transform":100}'::jsonb, ` +
    `equipment='{"weapon":"wand"}'::jsonb, tamed_beast_kinds='["wolf"]'::jsonb WHERE username='${CHAR}';`
);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

// Wisp first, then try to transform into a beast while still a wisp.
const wispRes = await emit(socket, 'castWispTransformation');
check('castWispTransformation succeeded', wispRes?.ok === true, JSON.stringify(wispRes));

const transformWhileWisp = await emit(socket, 'castTransform', { kind: 'wolf' });
check('castTransform rejected while wisp-active', transformWhileWisp?.ok === false, JSON.stringify(transformWhileWisp));
check(
  'rejection message mentions wisp form',
  /wisp form/i.test(transformWhileWisp?.message ?? ''),
  transformWhileWisp?.message
);

// Toggle wisp off, then transform into a beast, then try to wisp while
// beast-transformed.
await emit(socket, 'castWispTransformation');
const transformRes = await emit(socket, 'castTransform', { kind: 'wolf' });
check('castTransform succeeded once wisp is off', transformRes?.ok === true, JSON.stringify(transformRes));

const wispWhileBeast = await emit(socket, 'castWispTransformation');
check('castWispTransformation rejected while beast-transformed', wispWhileBeast?.ok === false, JSON.stringify(wispWhileBeast));
check(
  'rejection message mentions beast transform',
  /transformed into a beast/i.test(wispWhileBeast?.message ?? ''),
  wispWhileBeast?.message
);

socket.close();
process.exit(failures > 0 ? 1 : 0);
