// Live socket-driven verification for:
//  - renamed equipment slots (leftForearm/rightForearm -> leftArm/rightArm,
//    leftShin/rightShin -> leftLeg/rightLeg) and the new "gauntlets" slot
//  - the town-entry gate now requiring exactly [mask, torso, leftArm,
//    rightArm, gauntlets, leftLeg, rightLeg, boots], not every slot
//  - monster body parts tagged with their source name ("wild skeleton <part>")
//  - slime mimic/revert: mimicForms collection, "mimic"/"mimic <name>"/
//    "revert", equipment-slot eligibility switching with form, and score's
//    "Form:" line
//  - second attack / third attack as independent, stacking procs
//
// Requires the dev server running on :3000 and the text-arena-mongo
// container up. Run with
// `node tests/verify-equipment-mimic-and-attacks.mjs` from the repo root.
// Creates and cleans up its own test accounts (usernames prefixed "Ver...").
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

// Wander the Labyrinth (wild skeletons' home map) looking for a real
// monster to attack, since (unlike the training dummies) they roam to a
// random cell and aren't guaranteed to be in the player's starting room.
async function findAndKillWildSkeleton(socket) {
  async function tryAttackHere() {
    return sendCommand(socket, 'attack wild skeleton');
  }
  let ack = await tryAttackHere();
  if (ack.ok) return ack;
  for (let row = 0; row < 15; row++) {
    const goingEast = row % 2 === 0;
    for (let col = 0; col < 14; col++) {
      await sendCommand(socket, goingEast ? 'e' : 'w');
      ack = await tryAttackHere();
      if (ack.ok) return ack;
    }
    await sendCommand(socket, 's');
    ack = await tryAttackHere();
    if (ack.ok) return ack;
  }
  return ack;
}

async function main() {
  // === Test 1: renamed slots + gauntlets show up in "equipment" ===
  {
    const username = `VerSlot${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    const ack = await sendCommand(socket, 'equipment');
    const joined = ack.messages.join(' | ');
    console.log('equipment view ->', ack.messages);
    assert(/Left Arm:/.test(joined) && /Right Arm:/.test(joined), 'shows renamed Left Arm/Right Arm slots');
    assert(/Left Leg:/.test(joined) && /Right Leg:/.test(joined), 'shows renamed Left Leg/Right Leg slots');
    assert(/Gauntlets:/.test(joined), 'shows the new Gauntlets slot');
    assert(!/Forearm/.test(joined) && !/Shin/.test(joined), 'no leftover Forearm/Shin labels');
    socket.emit('command', 'logout', () => {});
    socket.close();
  }

  // === Test 2: town gate requires exactly the 8-slot list, not all 15 ===
  {
    const username = `VerGate${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(500);
    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{map:"Great Plains", row:30, col:0}})`);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.map === 'Great Plains' && sync.player.row === 30 && sync.player.col === 0, 'teleported to the Floro gate tile');

    socket2.close();
    await sleep(500);
    // Only the 8 required slots — leftEar/rightEar/head/weapon/shield/
    // leftRing/rightRing/necklace are deliberately left empty.
    mongoEval(
      `db.players.updateOne({username:"${username}"}, {\$set:{equipment:{mask:"bone mask",torso:"test",leftArm:"test",rightArm:"test",gauntlets:"test",leftLeg:"test",rightLeg:"test",boots:"test"}}})`
    );
    const { socket: socket3 } = await connectSocket(token);
    const ack = await sendCommand(socket3, 'w');
    console.log('partially-equipped (8-slot) goblin attempts to enter Floro ->', ack.messages);
    assert(ack.ok && ack.player.map === 'Floro', 'goblin with only the 8 required slots filled crosses into Floro');
    socket3.emit('command', 'logout', () => {});
    socket3.close();
  }

  // === Test 3: wild skeleton drops a sourced body part name ===
  {
    const username = `VerDrop${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    const ack = await findAndKillWildSkeleton(socket);
    assert(ack.ok, 'engaged a wild skeleton');
    let sawSourcedDrop = ack.messages.some((m) => /wild skeleton (leg|arm|hand|skull|rib)/.test(m));
    let died = ack.messages.some((m) => /crumbles, leaving behind/.test(m));
    for (let i = 0; i < 40 && !died; i++) {
      const payload = await waitForCombatUpdate(socket, 8000).catch(() => null);
      if (!payload) break;
      console.log('wild skeleton tick:', payload.messages);
      if (payload.messages.some((m) => /wild skeleton (leg|arm|hand|skull|rib)/.test(m))) sawSourcedDrop = true;
      if (payload.messages.some((m) => /crumbles, leaving behind/.test(m))) died = true;
      if (payload.ended) died = true;
    }
    assert(sawSourcedDrop, 'wild skeleton drop is named "wild skeleton <part>"');
    socket.emit('command', 'logout', () => {});
    socket.close();
  }

  // === Test 4: slime mimic/revert ===
  {
    const username = `VerMimic${randomLetters(5)}`;
    const token = await registerOnly('slime', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(500);

    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{inventory:["wild skeleton leg","goblin leg"]}})`);
    const { socket: socket2 } = await connectSocket(token);

    let ack = await sendCommand(socket2, 'consume wild skeleton leg');
    console.log('consume wild skeleton leg ->', ack.messages);
    assert(ack.messages.some((m) => /form of a wild skeleton/.test(m)), 'consuming a wild skeleton part adds it to mimicForms');

    ack = await sendCommand(socket2, 'consume goblin leg');
    console.log('consume goblin leg ->', ack.messages);
    assert(ack.messages.some((m) => /form of a goblin/.test(m)), 'consuming a goblin part adds it to mimicForms');

    ack = await sendCommand(socket2, 'mimic');
    console.log('mimic (bare) ->', ack.messages);
    assert(
      ack.messages.some((m) => /wild skeleton/.test(m)) && ack.messages.some((m) => /goblin/.test(m)),
      'bare "mimic" lists both consumed forms'
    );

    ack = await sendCommand(socket2, 'equipment');
    const baseSlots = ack.messages.join(' | ');
    assert(!/Left Arm:/.test(baseSlots) && !/Gauntlets:/.test(baseSlots), 'still-slime form only shows the base slime slot list');

    ack = await sendCommand(socket2, 'mimic wild');
    console.log('mimic wild ->', ack.messages);
    assert(ack.ok && ack.messages.some((m) => /wild skeleton/.test(m)), '"mimic wild" (partial match) takes on the wild skeleton form');

    ack = await sendCommand(socket2, 'equipment');
    const mimicSlots = ack.messages.join(' | ');
    console.log('equipment while mimicking ->', ack.messages);
    assert(/Left Arm:/.test(mimicSlots) && /Gauntlets:/.test(mimicSlots) && /Left Leg:/.test(mimicSlots), 'mimicking form shows the full equipment slot list');

    ack = await sendCommand(socket2, 'score');
    console.log('score while mimicking ->', ack.messages);
    assert(ack.messages.some((m) => m === 'Form: wild skeleton'), 'score shows "Form: wild skeleton" while mimicking');

    // Directly plant an item in a slot only the mimicked form can use
    // (no real item exists for leftArm yet), then revert and confirm it
    // comes back to inventory rather than being lost.
    socket2.close();
    await sleep(500);
    mongoEval(`db.players.updateOne({username:"${username}"}, {\$set:{equipment:{leftArm:"test-sleeve"}}})`);
    const { socket: socket3 } = await connectSocket(token);

    ack = await sendCommand(socket3, 'revert');
    console.log('revert ->', ack.messages);
    assert(ack.ok && ack.messages.some((m) => /test-sleeve/.test(m)), 'revert returns the illegal-slot item to inventory');

    ack = await sendCommand(socket3, 'inventory');
    console.log('inventory after revert ->', ack.messages);
    assert(ack.messages.some((m) => m.includes('test-sleeve')), 'test-sleeve is actually back in inventory');

    ack = await sendCommand(socket3, 'equipment');
    const revertedSlots = ack.messages.join(' | ');
    assert(!/Left Arm:/.test(revertedSlots), 'reverted form no longer shows the leftArm slot at all');

    ack = await sendCommand(socket3, 'score');
    assert(ack.messages.some((m) => m === 'Form: slime'), 'score shows "Form: slime" again after reverting');

    socket3.emit('command', 'logout', () => {});
    socket3.close();
  }

  // === Test 5: second attack / third attack are independent and stack ===
  {
    const username = `VerAttack${randomLetters(5)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(500);

    // Directly promote to hobgoblin with BOTH skills primed high, so each
    // has a large (~53%) independent chance to proc — a double-proc tick
    // (both messages in the same combat:update) proves they're not
    // mutually exclusive. Deliberately NOT boosting strength/level here —
    // low, un-boosted damage means the 100 HP dummy survives many ticks,
    // giving both skills plenty of independent trials (a heavy damage
    // boost was tried first and one/two-shot the dummy almost immediately,
    // leaving too few ticks to ever observe a double-proc).
    // hp/maxHp boosted (not strength) so the test account comfortably
    // outlasts TrainingGoblin's counter-attacks across many ticks, without
    // hitting hard enough to end the fight in just one or two swings.
    mongoEval(
      `db.players.updateOne({username:"${username}"}, {\$set:{race:"hobgoblin", hp:500, maxHp:500, "skillLevels.second attack":100,"skillLevels.third attack":100}})`
    );
    const { socket: socket2 } = await connectSocket(token);
    const { found, initialAck } = await findAndMurderDummy(socket2, 'TrainingGoblin');
    assert(found, 'found TrainingGoblin for the independent-attack test');
    if (found) {
      let died = false;
      let sawBothInSameTick = false;
      let sawSecond = false;
      let sawThird = false;
      const scan = (payload) => {
        if (!payload?.messages) return;
        const hasSecond = payload.messages.some((m) => /second attack triggers/.test(m));
        const hasThird = payload.messages.some((m) => /third attack triggers/.test(m));
        if (hasSecond) sawSecond = true;
        if (hasThird) sawThird = true;
        if (hasSecond && hasThird) sawBothInSameTick = true;
        if (payload.messages.some((m) => /You have murdered/.test(m))) died = true;
      };
      scan(initialAck);
      for (let i = 0; i < 80 && !died && !sawBothInSameTick; i++) {
        const payload = await waitForCombatUpdate(socket2, 8000).catch(() => null);
        if (!payload) break;
        scan(payload);
        if (payload.ended) died = true;
      }
      assert(sawSecond, '"second attack triggers" fires at least once');
      assert(sawThird, '"third attack triggers" fires at least once');
      assert(sawBothInSameTick, 'both second and third attack can trigger in the very same combat tick (independent, stacking)');
    }
    socket2.emit('command', 'logout', () => {});
    socket2.close();
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
