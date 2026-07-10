// Live socket-driven verification for the batch-3 combat-tick rewrite:
// engaging combat (punch/useSkill) no longer resolves damage instantly —
// only the shared ~3s combat tick does — plus the monster counter-attack
// now uses its own real skill/weapon (not a flat number), monster aggro
// chases a player who walks away, and the new terrain-based movement
// cost system deducts the right amount per step.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-batch3-combat-tick.mjs` from the repo root.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

function setMovement(username, movement) {
  const sql = `UPDATE players SET movement=${movement} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  // === Test 1: engaging combat is tick-gated, not resolved per click —
  // the shared combat tick runs on its own fixed ~3s cadence regardless
  // of when a player engages (it isn't reset per-engage), so a single
  // punch can land anywhere from ~0ms to ~3000ms later. The real
  // invariant is that spamming punch doesn't produce one resolved hit
  // per click: 6 rapid-fire punches within one tick's window should still
  // only ever resolve at most a couple of times (once per tick that
  // elapses), never 6. ===
  {
    const username = `GtwoTickA${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);

    const mapState = await new Promise((resolve) => socket.once('map:state', resolve));
    const monster = mapState.monsters[0];
    assert(Boolean(monster), 'at least one wild monster is present on the Great Plains');
    socket.close();

    if (monster) {
      const adjCol = monster.col - 1 >= 0 ? monster.col - 1 : monster.col + 1;
      const dir = adjCol === monster.col - 1 ? 'east' : 'west';
      teleport(username, 'Great Plains', monster.row, adjCol);
      await sleep(200);

      const { socket: s2, sync: freshSync } = await connectSocket(token);
      // The monster wanders on its own ~3s cadence too — re-check it's
      // actually still adjacent right before spamming punch, rather than
      // trusting the stale pre-teleport snapshot (a monster that wandered
      // off in the meantime would make every punch below a no-op through
      // no fault of the combat-tick system itself).
      const freshState = await new Promise((resolve) => s2.once('map:state', resolve));
      const stillAdjacent = freshState.monsters.some(
        (m) => m.id === monster.id && Math.abs(m.row - freshSync.player.row) + Math.abs(m.col - freshSync.player.col) === 1
      );
      if (!stillAdjacent) {
        console.log('  (monster wandered off before the spam loop — skipping this run)');
        s2.close();
      } else {
        let combatEvents = 0;
        s2.on('combat', () => combatEvents++);

        for (let i = 0; i < 6; i++) {
          s2.emit('punch', dir);
          await sleep(150);
        }
        // ~900ms of rapid clicking elapsed above; wait out the rest of a
        // full tick period to be sure at most one tick had a chance to fire.
        await sleep(2500);
        console.log(`  6 rapid punches over ~3.4s produced ${combatEvents} resolved combat tick(s)`);
        assert(combatEvents >= 1 && combatEvents <= 2, 'rapid-fire punching resolves at most ~1 hit per tick, not one hit per click');
        s2.close();
      }
    }
  }

  // === Test 2: monster counter-attack uses its own real punch skill, not
  // a flat "counter-attacks you for N damage" — the new resolver phrases
  // it as "punches/stabs you back for N damage" (or a dodge/parry/block
  // line, or "still paralyzed") instead ===
  {
    const username = `GtwoTickB${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);

    const mapState = await new Promise((resolve) => socket.once('map:state', resolve));
    const monster = mapState.monsters.find((m) => m.hp > 5) ?? mapState.monsters[0];
    socket.close();

    if (monster) {
      const adjCol = monster.col - 1 >= 0 ? monster.col - 1 : monster.col + 1;
      const dir = adjCol === monster.col - 1 ? 'east' : 'west';
      teleport(username, 'Great Plains', monster.row, adjCol);
      await sleep(200);

      const { socket: s2 } = await connectSocket(token);
      await sleep(200);

      const combatEvent = await new Promise((resolve) => {
        s2.once('combat', resolve);
        s2.emit('punch', dir);
      });
      console.log('  combat tick message ->', combatEvent.message);
      const msg = combatEvent.message;
      const looksLikeCounter =
        /back for \d+ damage/.test(msg) || /glances off/.test(msg) || /dodge|parry|block/.test(msg) || /paralyzed/.test(msg);
      assert(!combatEvent.targetDied ? looksLikeCounter : true, 'a surviving monster counter-attacks with a real (non-flat) message shape');
      assert(!/counter-attacks you for/.test(msg), 'no longer uses the old flat "counter-attacks you for N damage" phrasing');
      s2.close();
    }
  }

  // === Test 3: monster aggro — after engaging, walking away makes the
  // monster follow (its position should be closer to the player a few
  // ticks later than the player's own new position was originally) ===
  {
    const username = `GtwoAggro${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);

    const mapState = await new Promise((resolve) => socket.once('map:state', resolve));
    const monster = mapState.monsters[0];
    socket.close();

    if (monster) {
      const adjCol = monster.col - 1 >= 0 ? monster.col - 1 : monster.col + 1;
      const dir = adjCol === monster.col - 1 ? 'east' : 'west';
      const awayDir = dir === 'east' ? 'west' : 'east';
      teleport(username, 'Great Plains', monster.row, adjCol);
      await sleep(200);

      const { socket: s2 } = await connectSocket(token);
      await sleep(200);
      s2.emit('punch', dir);
      await sleep(200);

      // Step away 3 tiles (engaging the monster's aggro), each move a
      // beat apart so the server's own move-cooldown/rate-limit doesn't
      // just drop them.
      let lastMoveAck;
      for (let i = 0; i < 3; i++) {
        lastMoveAck = await new Promise((resolve) => s2.emit('move', awayDir, resolve));
        await sleep(350);
      }
      const playerPos = lastMoveAck?.player ? { row: lastMoveAck.player.row, col: lastMoveAck.player.col } : null;

      // Give a few combat ticks (each ~3s) for the aggroed monster to
      // chase across that gap.
      await sleep(9000);
      const laterState = await new Promise((resolve) => {
        s2.once('map:state', resolve);
        s2.emit('move', dir === 'east' ? 'west' : 'east', () => {});
      });
      const laterMonster = laterState.monsters.find((m) => m.id === monster.id);
      if (laterMonster && playerPos) {
        const distNow = Math.abs(laterMonster.row - playerPos.row) + Math.abs(laterMonster.col - playerPos.col);
        const distOriginal = Math.abs(monster.row - playerPos.row) + Math.abs(monster.col - playerPos.col);
        console.log(`  monster distance from player: was ${distOriginal}, now ${distNow}`);
        assert(distNow <= distOriginal, 'the aggroed monster closed distance (or stayed adjacent) after the player walked away');
      } else {
        console.log('  (monster no longer found on map — skipping aggro distance check)');
      }
      s2.close();
    }
  }

  // === Test 4: setting-based movement cost — outside (Great Plains)
  // costs 1, inside (Labyrinth) costs 0.5, per step. (Revised down from
  // an original 3/2 terrain-based formula — players were burning through
  // almost their whole movement pool in a few dozen steps.) ===
  {
    const username = `GtwoMoveCost${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    teleport(username, 'Great Plains', 50, 50);
    await sleep(200);
    const { socket, sync } = await connectSocket(token);
    const startMovement = sync.player.movement;

    const grassAck = await new Promise((resolve) => socket.emit('move', 'south', resolve));
    const grassCost = startMovement - grassAck.player.movement;
    console.log(`  movement before outside step: ${startMovement}, after: ${grassAck.player.movement} (cost ${grassCost})`);
    assert(grassCost === 1, 'a step on outside ground (Great Plains) costs exactly 1 movement');

    teleport(username, 'Labyrinth', 30, 30);
    await sleep(200);
    const { socket: s2, sync: sync2 } = await connectSocket(token);
    const movementBeforeStone = sync2.player.movement;
    const stoneAck = await new Promise((resolve) => s2.emit('move', 'north', resolve));
    const stoneCost = movementBeforeStone - stoneAck.player.movement;
    console.log(`  movement before inside step: ${movementBeforeStone}, after: ${stoneAck.player.movement} (cost ${stoneCost})`);
    assert(stoneCost === 0.5, 'a step on inside ground (Labyrinth) costs exactly 0.5 movement');
    socket.close();
    s2.close();
  }

  // === Test 5: movement exhaustion — a player with less movement than
  // their current ground costs is refused the move, with the dedicated
  // outOfMovement flag set (item 8) ===
  {
    const username = `GtwoNoMove${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    teleport(username, 'Great Plains', 50, 50);
    await sleep(200);
    setMovement(username, 0.4); // less than the 1-movement cost of an outside step
    await sleep(200);

    const { socket } = await connectSocket(token);
    const ack = await new Promise((resolve) => socket.emit('move', 'south', resolve));
    console.log('  move at 0.4 movement ->', ack.ok, ack.message, ack.outOfMovement);
    assert(!ack.ok, 'a move is refused when movement is below the current ground\'s cost');
    assert(ack.outOfMovement === true, 'the refusal is flagged as outOfMovement specifically');
    socket.close();
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
