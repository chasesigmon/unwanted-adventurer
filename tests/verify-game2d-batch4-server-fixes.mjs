// Live socket-driven verification for the server-visible half of batch 4:
// the skill-cooldown ack push (item 5 — a skill's cooldown used to only
// reach the client's own myProfile on the NEXT full 'sync', which could
// be minutes away) and the torch's 1% lesser-fire-resistance grant on
// consume (item 9).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-batch4-server-fixes.mjs` from the repo root.
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

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
}

function teleport(username, map, row, col) {
  return sql(`UPDATE players SET map='${map}', "row"=${row}, col=${col} WHERE username='${username}';`);
}

async function main() {
  // === Test 1: skill cooldown reaches the client immediately, via a
  // fresh 'sync' pushed right when the cooldown starts, not just on the
  // next unrelated full sync (item 5) ===
  {
    const username = `GfourGlare${randomLetters(3)}`;
    const token = await registerOnly('skeleton', username);
    const { socket } = await connectSocket(token);

    const mapState = await new Promise((resolve) => socket.once('map:state', resolve));
    const monster = mapState.monsters[0];
    socket.close();
    assert(Boolean(monster), 'at least one wild monster is present to test glare against');

    if (monster) {
      const adjCol = monster.col - 1 >= 0 ? monster.col - 1 : monster.col + 1;
      const dir = adjCol === monster.col - 1 ? 'east' : 'west';
      teleport(username, 'Great Plains', monster.row, adjCol);
      await sleep(200);

      const { socket: s2 } = await connectSocket(token);
      let sawCooldownSync = false;
      s2.on('sync', (sync) => {
        if (sync.player.skillCooldowns['glare'] !== undefined) sawCooldownSync = true;
      });
      await sleep(150);
      s2.emit('useSkill', { direction: dir, skill: 'glare' });

      // A combat tick is ~3s; give it a couple ticks to actually resolve
      // and push the cooldown sync.
      await sleep(7000);
      console.log(`  saw a 'sync' with glare's cooldown populated: ${sawCooldownSync}`);
      assert(sawCooldownSync, "a 'sync' carrying the fresh glare cooldown arrives without waiting for an unrelated future sync");
      s2.close();
    }
  }

  // === Test 2: consuming (right-click force-consume) a torch has a
  // small chance of granting lesser fire resistance (item 9) — rolled
  // many times via direct SQL skill-clearing between attempts since the
  // 1% chance makes a single consume an unreliable test on its own ===
  {
    const username = `GfourTorch${randomLetters(3)}`;
    const token = await registerOnly('goblin', username);
    const { socket, sync } = await connectSocket(token);
    // Give ourselves a stack of torches directly (bypassing the shop) so
    // we can roll the 1% chance many times quickly.
    sql(`UPDATE players SET inventory='${JSON.stringify(new Array(400).fill('torch'))}' WHERE username='${username}';`);
    await sleep(200);

    const { socket: s2 } = await connectSocket(token);
    let gained = false;
    for (let i = 0; i < 400 && !gained; i++) {
      const ack = await new Promise((resolve) => s2.emit('consumeItem', 0, resolve));
      if (!ack.ok) break;
      if (ack.skills && ack.skills['lesser fire resistance'] !== undefined) gained = true;
    }
    console.log(`  learned lesser fire resistance from consuming torches: ${gained}`);
    assert(gained, 'consuming enough torches eventually grants lesser fire resistance (1% per consume)');
    socket.close();
    s2.close();
    void sync;
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
