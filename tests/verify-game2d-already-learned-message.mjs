// Live socket verification for item 1's "already learned" message: once
// a resistance skill (or bone finger strike) is learned, consuming
// another item that maps to the same skill should say so instead of
// silently doing nothing extra.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-already-learned-message.mjs` from the repo
// root. Registers through the new account/character flow (see the
// account-system batch) since plain /auth/register no longer accepts a
// character directly.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

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

async function postJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
}

async function registerCharacter(race, charName) {
  const email = `gsix${randomLetters(6)}@example.com`;
  const acctUsername = `Gsix${randomLetters(6)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  const accountToken = reg.body.token;
  const create = await postJson('/characters', { name: charName, race }, accountToken);
  if (!create.body.ok) throw new Error(`character create failed: ${JSON.stringify(create.body)}`);
  const select = await postJson(`/characters/${charName}/select`, {}, accountToken);
  return select.body.token;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}

async function main() {
  const charName = `Gsixa${randomLetters(4)}`;
  const token = await registerCharacter('goblin', charName);

  // Force-grant lesser normal monster resistance directly via SQL (the
  // 10% roll on consuming a wild goblin ear is too unreliable to depend
  // on for a deterministic test) — inventory gets a stack of ears to
  // consume against it. Applied BEFORE connecting, since the gateway
  // only loads client.data from the DB row once, at connect time.
  sql(`UPDATE players SET skills = skills || '{"lesser normal monster resistance": 10}'::jsonb, inventory = '${JSON.stringify(
    new Array(3).fill('wild goblin ear')
  )}' WHERE username='${charName}';`);

  const { socket } = await connectSocket(token);

  const consumeOnce = () => new Promise((resolve) => socket.emit('consumeItem', 0, resolve));
  const ack1 = await consumeOnce();
  console.log('  consume #1 (skill already known) ->', ack1.message);
  assert(
    ack1.ok && ack1.message?.includes('already learned lesser normal monster resistance'),
    'consuming an item mapped to an already-known skill returns an "already learned" message'
  );

  const ack2 = await consumeOnce();
  console.log('  consume #2 (skill already known) ->', ack2.message);
  assert(
    ack2.ok && ack2.message?.includes('already learned lesser normal monster resistance'),
    'the "already learned" message repeats on every subsequent consume of that item type'
  );

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
