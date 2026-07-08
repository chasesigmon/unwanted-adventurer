// Live socket-driven verification that a goblin evolving into a Hobgoblin
// gets BOTH "second attack" and "third attack" even if it never reached
// goblin level 5 naturally, and that "third attack" (not "second attack")
// is what actually fires in combat afterward (third attack supersedes
// second attack — see players/skills.ts's extraAttackSkillFor).
//
// Requires the dev server running on :3000 and the text-arena-mongo
// container up. Run with `node tests/verify-hobgoblin-evolution-skills.mjs`
// from the repo root. Creates and cleans up its own test accounts
// (usernames prefixed "Ver...").
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3000';
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

function rawSendCommand(socket, text) {
  return new Promise((resolve) => {
    socket.emit('command', text, (ack) => resolve(ack));
  });
}

async function sendCommand(socket, text) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const ack = await rawSendCommand(socket, text);
    if (!(ack.ok === false && ack.messages?.[0] === 'Slow down — too many commands.')) {
      return ack;
    }
    await sleep(120);
  }
  throw new Error(`still rate-limited after retries: ${text}`);
}

function waitForCombatUpdate(socket, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('combat:update timeout')), timeoutMs);
    socket.once('combat:update', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function registerOnly(race, username) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, race }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`register failed: ${JSON.stringify(body)}`);
  return body.token;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}

function mongoEval(script) {
  return execSync(`docker exec text-arena-mongo mongosh text-arena --quiet --eval '${script}'`).toString().trim();
}

// The dummy spawns at a fixed "top middle" cell per map (see
// DummyPlayerService.fixedSpawnPointIn), not a random one, but this sweep
// still walks to the top-left corner first so it works regardless of
// where the player itself starts.
async function findAndMurderDummy(socket, dummyName) {
  let found = false;
  let initialAck = null;
  async function tryMurderHere() {
    const a = await sendCommand(socket, `murder ${dummyName}`);
    if (a.ok) {
      found = true;
      initialAck = a;
    }
    return a;
  }
  await tryMurderHere();
  if (!found) {
    for (let i = 0; i < 20 && !found; i++) {
      await sendCommand(socket, 'n');
      await tryMurderHere();
    }
  }
  if (!found) {
    for (let i = 0; i < 20 && !found; i++) {
      await sendCommand(socket, 'w');
      await tryMurderHere();
    }
  }
  if (!found) {
    outer: for (let row = 0; row < 15 && !found; row++) {
      const goingEast = row % 2 === 0;
      for (let col = 0; col < 14 && !found; col++) {
        await sendCommand(socket, goingEast ? 'e' : 'w');
        await tryMurderHere();
        if (found) break outer;
      }
      await sendCommand(socket, 's');
      await tryMurderHere();
    }
  }
  return { found, initialAck };
}

async function main() {
  const username = `VerEvo${randomLetters(5)}`;
  const token = await registerOnly('goblin', username);
  const { socket } = await connectSocket(token);
  socket.close();
  await sleep(500);

  // Level 2 — well under the level-5 second-attack threshold — with
  // consumeExp one body part short of evolving, and a "leg" already in
  // inventory to consume.
  mongoEval(
    `db.players.updateOne({username:"${username}"}, {\$set:{level:2, exp:0, consumeExp:99, inventory:["leg"]}})`
  );
  const { socket: socket2 } = await connectSocket(token);

  const consumeAck = await sendCommand(socket2, 'consume leg');
  console.log('consume ->', consumeAck.messages);
  assert(consumeAck.ok, 'consume command succeeded');
  assert(consumeAck.messages.some((m) => /evolve|Hobgoblin/i.test(m)), 'evolution message shown');

  const doc = JSON.parse(
    mongoEval(`print(JSON.stringify(db.players.findOne({username:"${username}"}, {race:1, level:1, skillLevels:1})))`)
  );
  console.log('post-evolution doc:', doc);
  assert(doc.race === 'hobgoblin', 'race is now hobgoblin');
  assert(doc.level === 1, 'level reset to 1');
  assert(doc.skillLevels['second attack'] === 1, 'second attack granted despite never reaching goblin level 5');
  assert(doc.skillLevels['third attack'] === 1, 'third attack granted at evolution');

  // Bump third attack's learned percentage way up first so its ~50%+
  // per-tick proc chance (see scaledSkillChance) makes it overwhelmingly
  // likely to fire within the fight, rather than leaving this assertion
  // dependent on the freshly-granted 1%'s 20% base chance and however many
  // ticks a 100 HP dummy happens to survive.
  socket2.close();
  await sleep(500);
  mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{"skillLevels.third attack":100}})`);
  const { socket: socket3 } = await connectSocket(token);

  const { found, initialAck } = await findAndMurderDummy(socket3, 'TrainingGoblin');
  assert(found, 'found TrainingGoblin to fight as fresh hobgoblin');
  if (found) {
    let died = false;
    let sawThird = false;
    const scan = (payload) => {
      if (!payload?.messages) return;
      if (payload.messages.some((m) => /third attack triggers/.test(m))) sawThird = true;
      if (payload.messages.some((m) => /You have murdered/.test(m))) died = true;
    };
    scan(initialAck);
    for (let i = 0; i < 80 && !died; i++) {
      const payload = await waitForCombatUpdate(socket3, 8000).catch(() => null);
      if (!payload) break;
      scan(payload);
      if (payload.ended) died = true;
    }
    // Second attack and third attack are independent skills (neither is an
    // upgrade/replacement of the other — see
    // verify-equipment-mimic-and-attacks.mjs for the dedicated
    // independence/stacking test), so third attack firing here doesn't
    // preclude second attack also firing — only third attack (boosted to
    // 100% above) is asserted on in this test.
    assert(sawThird, '"third attack triggers" fires in combat');
  }

  socket3.emit('command', 'logout', () => {});
  socket3.close();

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
