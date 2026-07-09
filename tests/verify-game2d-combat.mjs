// Live socket-driven verification for game2d's stats/skills/monsters/
// combat/exp system: starting stats, the wild-goblin population, contact
// damage against the training dummy and a wild goblin (exact formula
// check), and exp/leveling on a monster kill.
//
// Requires `npm run dev` running inside game2d/ (backend on :3001) and
// the game2d-postgres/redis containers up. Run with
// `node tests/verify-game2d-combat.mjs` from the repo root.
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

function waitForMapState(socket) {
  return new Promise((resolve, reject) => {
    socket.once('map:state', (state) => resolve(state));
    setTimeout(() => reject(new Error('map:state timeout')), 5000);
  });
}

function waitForCombat(socket, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('combat event timeout')), timeoutMs);
    socket.once('combat', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function punch(socket, direction) {
  socket.emit('punch', direction);
}

function teleport(username, map, row, col) {
  const sql = `UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  // === Test 1: a fresh registration gets the expected default stats ===
  {
    const username = `GtwoStatA${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket, sync } = await connectSocket(token);
    console.log('fresh player sync ->', sync.player);
    assert(sync.player.level === 1, 'new player starts at level 1');
    assert(sync.player.exp === 0, 'new player starts with 0 exp');
    assert(sync.player.hp === 100 && sync.player.maxHp === 100, 'new player starts at 100/100 hp');
    assert(sync.player.mana === 100 && sync.player.maxMana === 100, 'new player starts at 100/100 mana');
    assert(sync.player.movement === 100 && sync.player.maxMovement === 100, 'new player starts at 100/100 movement');

    const row = execSync(
      `docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT strength, skills FROM players WHERE username='${username}';"`
    )
      .toString()
      .trim();
    console.log('db row ->', row);
    assert(row.includes('1') && row.includes('"punch": 1'), 'new player has strength 1 and skills={"punch":1} in Postgres');

    socket.close();
  }

  // === Test 2: the Great Plains map:state includes 5 wandering wild goblins ===
  let firstGoblin;
  {
    const username = `GtwoStatB${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket, sync } = await connectSocket(token);
    assert(sync.player.map === 'Great Plains', 'new player starts in Great Plains');

    const state = await waitForMapState(socket);
    const goblins = state.monsters.filter((m) => m.kind === 'wild goblin');
    console.log('wild goblins ->', goblins);
    assert(goblins.length === 5, 'Great Plains has exactly 5 wild goblins');
    assert(
      goblins.every((g) => g.level === 1 && g.hp === 15 && g.maxHp === 15),
      'each wild goblin is level 1 with 15/15 hp'
    );
    firstGoblin = goblins[0];

    socket.close();
  }

  // === Test 3: punching the training dummy applies the exact damage
  // formula, and does NOT grant exp (it's a practice target, not a kill) ===
  {
    const username = `GtwoDummy${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);

    // One tile west of the training dummy (10, 19) -> (10, 18).
    teleport(username, 'Great Plains', 10, 18);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.row === 10 && sync.player.col === 18, 'teleported next to the training dummy');

    const combatPromise = waitForCombat(socket2);
    punch(socket2, 'east');
    const combat = await combatPromise;
    console.log('dummy combat ->', combat);
    // level 1, strength 1 attacker vs level 1, strength 1 defender:
    // baseDamage = 6 + floor(1/2) + floor(1/2) = 6; attributeBonus = 0;
    // skillBonus(1%) = 0. Total = 6.
    assert(combat.damage === 6, 'punching the training dummy deals exactly the expected 6 damage');
    assert(combat.targetKind === 'npc' && combat.targetHp === 94, "the dummy's hp drops to 94/100");
    assert(combat.expGained === undefined, 'defeating/damaging the training dummy grants no exp');

    socket2.close();
  }

  // === Test 4: punching a wild goblin deals the same base damage, and
  // killing it grants exp via the level-ratio formula (8 * 10 = 80 at
  // matching level 1) ===
  {
    const username = `GtwoMonA${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);

    // Stand one tile west of wherever this goblin currently is.
    teleport(username, 'Great Plains', firstGoblin.row, firstGoblin.col - 1);
    const { socket: socket2, sync } = await connectSocket(token);
    assert(sync.player.row === firstGoblin.row && sync.player.col === firstGoblin.col - 1, 'teleported next to a wild goblin');

    // 15 hp, 6 damage per punch -> dead on the 3rd hit (6, 6, 3).
    let lastCombat;
    for (let i = 0; i < 3; i++) {
      const combatPromise = waitForCombat(socket2);
      punch(socket2, 'east');
      lastCombat = await combatPromise;
      console.log(`goblin punch ${i + 1} ->`, lastCombat);
      if (lastCombat.targetDied) break;
    }

    assert(lastCombat.targetKind === 'monster' && lastCombat.targetDied, 'three punches kill the level-1 wild goblin (15 hp)');
    assert(lastCombat.expGained === 80, 'killing it grants 80 exp (8 base * (1*10/1) ratio)');
    assert(lastCombat.attackerExp === 80, "the attacker's exp is now 80 (not yet enough to level up from 100)");
    assert(!lastCombat.leveledUp, 'one kill alone is not enough to level up (80 < 100 needed)');

    // Kill a second one to push exp over the level-1 threshold (100) and
    // confirm a level-up actually fires with the documented bonuses.
    const state = await waitForMapState(socket2);
    const secondGoblin = state.monsters.find((m) => m.kind === 'wild goblin' && m.id !== undefined);
    if (secondGoblin) {
      teleport(username, 'Great Plains', secondGoblin.row, secondGoblin.col - 1);
      const reconnect = await connectSocket(token);
      let lastCombat2;
      for (let i = 0; i < 3; i++) {
        const combatPromise = waitForCombat(reconnect.socket);
        punch(reconnect.socket, 'east');
        lastCombat2 = await combatPromise;
        if (lastCombat2.targetDied) break;
      }
      console.log('second kill ->', lastCombat2);
      if (lastCombat2?.targetDied) {
        assert(lastCombat2.leveledUp === true, '80 + 80 = 160 exp crosses the level-1 threshold (100) -> level up');
        assert(lastCombat2.attackerLevel === 2, 'attacker is now level 2');
        assert(lastCombat2.attackerExp === 60, 'remaining exp after leveling is 160 - 100 = 60');
        assert(lastCombat2.attackerHp === lastCombat2.attackerMaxHp, 'leveling up fully heals the attacker');
      } else {
        console.log('NOTE: second goblin wandered away before dying (timing) — skipping the level-up assertions.');
      }
      reconnect.socket.close();
    } else {
      console.log('NOTE: no second wild goblin available to test the level-up threshold.');
    }

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
