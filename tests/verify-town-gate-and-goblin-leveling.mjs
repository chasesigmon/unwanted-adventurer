// Live socket-driven verification for:
//  - worldmap includes Floro/Kortho (20x20, each connecting to Great Plains)
//  - the "time" command
//  - the town-entry gate (blocked unequipped, allowed fully-equipped+masked)
//  - goblin leveling: "second attack" granted at level 5, max level 10 cap
//
// Requires the dev server running on :3000 and the text-arena-mongo
// container up. Run with `node tests/verify-town-gate-and-goblin-leveling.mjs`
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
  // === Test 1: worldmap includes Floro/Kortho ===
  {
    const username = `VerWorld${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    const ack = await sendCommand(socket, 'worldmap');
    console.log('worldmap areas:', ack.worldMap?.map((a) => `${a.name} (${a.rows}x${a.cols}) -> ${a.connectsTo.join(',')}`));
    const floro = ack.worldMap?.find((a) => a.name === 'Floro');
    const kortho = ack.worldMap?.find((a) => a.name === 'Kortho');
    assert(!!floro && floro.rows === 20 && floro.cols === 20, 'Floro registered at 20x20');
    assert(!!kortho && kortho.rows === 20 && kortho.cols === 20, 'Kortho registered at 20x20');
    assert(floro.connectsTo.includes('Great Plains'), 'Floro connects to Great Plains');
    assert(kortho.connectsTo.includes('Great Plains'), 'Kortho connects to Great Plains');
    socket.emit('command', 'logout', () => {});
    socket.close();
  }

  // === Test 2: time command ===
  {
    const username = `VerTime${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    const ack = await sendCommand(socket, 'time');
    console.log('time ->', ack.messages);
    assert(
      ack.messages.some((m) => /^The time is \d+ \((day|night)\)\.$/.test(m)),
      'time command shows "The time is N (day/night)."'
    );
    socket.emit('command', 'logout', () => {});
    socket.close();
  }

  // === Test 3: town-entry gate ===
  {
    const username = `VerTown${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);

    // Close first so handleDisconnect's own position-persist can't race
    // with (and overwrite) the manual teleport below.
    socket.close();
    await sleep(500);
    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{map:"Great Plains", row:30, col:0}})`);

    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.map === 'Great Plains' && sync.player.row === 30 && sync.player.col === 0, 'teleported to the Floro gate tile');

    let ack = await sendCommand(socket2, 'w');
    console.log('unequipped goblin attempts to enter Floro ->', ack.messages);
    assert(!ack.ok && /guards|mask/.test(ack.messages.join(' ')), 'unequipped goblin is blocked from entering Floro');
    assert(ack.player.map === 'Great Plains', 'still in Great Plains after being blocked');

    // Simulate full equipment directly (most slots have no real items in
    // the game yet) to exercise the "allowed" path of the same check.
    socket2.close();
    await sleep(500);
    mongoEval(
      `db.players.updateOne({username:"${username}"}, {\$set:{equipment:{head:"test",mask:"bone mask",leftEar:"test",rightEar:"test",torso:"test",leftArm:"test",rightArm:"test",gauntlets:"test",shield:"bone shield",weapon:"bone dagger",leftRing:"test",rightRing:"test",necklace:"test",leftLeg:"test",rightLeg:"test",boots:"test"}}})`
    );
    const { socket: socket3 } = await connectSocket(token);
    ack = await sendCommand(socket3, 'w');
    console.log('fully-equipped-and-masked goblin attempts to enter Floro ->', ack.messages);
    assert(ack.ok && ack.player.map === 'Floro', 'fully-equipped-and-masked goblin crosses into Floro');

    socket3.emit('command', 'logout', () => {});
    socket3.close();
  }

  // === Test 4: goblin second attack at level 5, max level 10 ===
  {
    const username = `VerLvl${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(500);

    // Prime to level 4 with exp just shy of leveling — level 5 needs
    // exp >= 4*100=400 from level 4 (maxTnlForLevel(4)=400).
    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{level:4, exp:390}})`);
    const { socket: socket2 } = await connectSocket(token);
    const { found } = await findAndMurderDummy(socket2, 'TrainingGoblin');
    assert(found, 'found TrainingGoblin (level-5 second-attack test)');
    if (found) {
      let died = false;
      let sawSecondAttackGrant = false;
      for (let i = 0; i < 60 && !died; i++) {
        const payload = await waitForCombatUpdate(socket2, 8000).catch(() => null);
        if (!payload) break;
        console.log('level-5 tick:', payload.messages);
        if (payload.messages.some((m) => /learned second attack/.test(m))) sawSecondAttackGrant = true;
        if (payload.ended) died = true;
      }
      assert(sawSecondAttackGrant, 'reaching level 5 granted "second attack"');
      const doc = JSON.parse(mongoEval(`print(JSON.stringify(db.players.findOne({username:"${username}"}, {level:1,skillLevels:1})))`));
      console.log('post-level-up doc:', doc);
      assert(doc.level >= 5, 'goblin actually reached level 5+');
      assert(doc.skillLevels['second attack'] === 1, 'second attack present at 1%');
    }
    // No "logout" here — it revokes the session token, and this test
    // reconnects with the same token below.
    socket2.close();

    // Now prime to level 9, near the cap, kill again to hit level 10 + cap message.
    await sleep(500);
    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{level:9, exp:890}})`);
    const { socket: socket3 } = await connectSocket(token);
    const { found: found2, initialAck: initialAck2 } = await findAndMurderDummy(socket3, 'TrainingGoblin');
    assert(found2, 'found TrainingGoblin again (level-10 cap test)');
    if (found2) {
      let died2 = false;
      // The very first "murder" ack can itself embed a synchronous kill
      // (see handleMurder -> resolveMurderExchange), same as the no-exp
      // check below already accounts for — scan it too, not just the
      // combat:update ticks that follow.
      let sawCapMessage = !!initialAck2?.messages?.some((m) => /maximum level for a goblin/.test(m));
      if (initialAck2?.messages?.some((m) => /You have murdered/.test(m))) died2 = true;
      for (let i = 0; i < 60 && !died2; i++) {
        const payload = await waitForCombatUpdate(socket3, 8000).catch(() => null);
        if (!payload) break;
        console.log('level-10 tick:', payload.messages);
        if (payload.messages.some((m) => /maximum level for a goblin/.test(m))) sawCapMessage = true;
        if (payload.ended) died2 = true;
      }
      assert(sawCapMessage, 'reaching level 10 shows the goblin max-level message');
      const doc2 = JSON.parse(mongoEval(`print(JSON.stringify(db.players.findOne({username:"${username}"}, {level:1,exp:1})))`));
      assert(doc2.level === 10, `level clamped to exactly 10 (got ${doc2.level})`);
    }

    // One more kill attempt at level 10 should grant NO exp at all.
    const { found: found3, initialAck } = await findAndMurderDummy(socket3, 'TrainingGoblin');
    // TrainingGoblin may still be dead/respawning; if found, check the ack directly.
    if (found3 && initialAck) {
      console.log('level-10 no-exp attempt ->', initialAck.messages);
      assert(
        initialAck.messages.some((m) => /cannot progress past level 10/.test(m)) || !initialAck.messages.some((m) => /You gain \d+ experience/.test(m)),
        'no further exp is granted once at the goblin level cap'
      );
    }
    socket3.emit('command', 'logout', () => {});
    socket3.close();
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
