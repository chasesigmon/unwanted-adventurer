// Live HTTP+socket verification for the new account/character system
// (item 1): registration is now email/username/password only (no race),
// login returns an account-level token, and a character must be listed/
// created/selected before a game socket will ever accept a connection —
// an account-level token is explicitly rejected by the socket handshake.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-account-character-system.mjs` from the repo
// root.
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';
function randomLetters(n) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}
const PASSWORD = 'testpass123';

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getJson(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
}

function connectAttempt(token) {
  return new Promise((resolve) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    const timer = setTimeout(() => {
      socket.close();
      resolve({ outcome: 'timeout' });
    }, 3000);
    socket.once('sync', (sync) => {
      clearTimeout(timer);
      resolve({ outcome: 'sync', sync, socket });
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      resolve({ outcome: 'connect_error', message: err.message });
    });
  });
}

async function main() {
  const email = `gfive${randomLetters(5)}@example.com`;
  const acctUsername = `Gfive${randomLetters(5)}`;
  const charA = `Gfivea${randomLetters(3)}`;
  const charB = `Gfiveb${randomLetters(3)}`;

  // === Register (email/username/password, no race) ===
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  assert(reg.status === 201 || reg.status === 200, `register succeeds (status ${reg.status})`);
  const accountToken = reg.body.token;
  assert(Boolean(accountToken), 'register returns an account-level token');

  // === An account token cannot connect the game socket directly ===
  const rejected = await connectAttempt(accountToken);
  console.log('  account-token socket connect attempt ->', rejected.outcome, rejected.message ?? '');
  assert(rejected.outcome === 'connect_error', 'the game socket refuses a raw account-level token');

  // === Fresh account starts with zero characters ===
  const emptyList = await getJson('/characters', accountToken);
  assert(emptyList.status === 200 && Array.isArray(emptyList.body.characters) && emptyList.body.characters.length === 0,
    'a fresh account starts with an empty character list');

  // === Create two characters under the same account ===
  const createA = await postJson('/characters', { name: charA, race: 'goblin' }, accountToken);
  assert(createA.status === 201 || createA.status === 200, `creating character A succeeds (status ${createA.status})`);
  const createB = await postJson('/characters', { name: charB, race: 'skeleton' }, accountToken);
  assert(createB.status === 201 || createB.status === 200, `creating character B succeeds (status ${createB.status})`);

  const list = await getJson('/characters', accountToken);
  const names = (list.body.characters ?? []).map((c) => c.name);
  console.log('  character list ->', names);
  assert(names.includes(charA) && names.includes(charB), 'both created characters show up in the account\'s character list');

  // === Selecting a character issues a character-level token that DOES connect ===
  const select = await postJson(`/characters/${charA}/select`, {}, accountToken);
  assert(select.status === 200, `selecting character A succeeds (status ${select.status})`);
  const characterToken = select.body.token;
  assert(Boolean(characterToken), 'selecting a character returns a character-level token');

  const connected = await connectAttempt(characterToken);
  console.log('  character-token socket connect attempt ->', connected.outcome);
  assert(connected.outcome === 'sync', 'a character-level token connects the game socket normally');
  assert(connected.sync?.player?.username === charA, 'the connected socket is for the exact character that was selected');
  connected.socket?.close();

  // === A second, unrelated account cannot select someone else's character ===
  const otherEmail = `gfive${randomLetters(5)}@example.com`;
  const otherUsername = `Gfive${randomLetters(5)}`;
  const otherReg = await postJson('/auth/register', { email: otherEmail, username: otherUsername, password: PASSWORD });
  const otherToken = otherReg.body.token;
  const stolenSelect = await postJson(`/characters/${charA}/select`, {}, otherToken);
  console.log('  cross-account character-select attempt -> status', stolenSelect.status);
  assert(stolenSelect.status === 403, "a different account can't select another account's character (403 Forbidden)");

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
