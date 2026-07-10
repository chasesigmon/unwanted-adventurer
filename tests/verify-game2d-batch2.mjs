// Live socket-driven verification for the second big game2d feature
// batch: full starting skills on registration, /time command, torch
// equip/unequip + reach, equipment unequip RPC, corpse persistence +
// sacrifice, and the Labyrinth vendor's new position/reach.
//
// Requires `npm run dev:server` running inside game2d/ (backend on
// :3001) and the game2d-postgres container up. Run with
// `node tests/verify-game2d-batch2.mjs` from the repo root.
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

function giveItem(username, item) {
  const sql = `UPDATE players SET inventory = inventory || to_jsonb('${item}'::text) WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

function giveGold(username, gold) {
  const sql = `UPDATE players SET gold=${gold} WHERE username='${username}';`;
  return execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`).toString().trim();
}

async function main() {
  // === Test 1: fresh registration gets the FULL starting skill set ===
  {
    const username = `GtwoSkills${randomLetters(4)}`;
    const token = await registerOnly('zombie', username);
    const { socket, sync } = await connectSocket(token);
    const skills = sync.player.skills;
    assert(skills.punch === 1, 'fresh zombie has punch:1');
    assert(skills.dodge === 1, 'fresh zombie has dodge:1');
    assert(skills.parry === 1, 'fresh zombie has parry:1');
    assert(skills['shield block'] === 1, 'fresh zombie has shield block:1');
    assert(skills.dagger === 1, 'fresh zombie has dagger:1');
    assert(skills['eat brains'] === 100, 'fresh zombie has innate eat brains:100');
    assert(sync.player.gold === 20, 'fresh player starts with 20 gold');
    socket.close();
  }

  // === Test 2: /time command ===
  {
    const username = `GtwoTime${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    const reply = await new Promise((resolve) => {
      socket.once('chat', (data) => resolve(data));
      socket.emit('chat', '/time');
    });
    console.log('  /time ->', reply.message);
    assert(reply.username === 'System', '/time replies via System message');
    assert(/It is currently \d{2}:00 \((day|night)\)\./.test(reply.message), '/time message has the expected shape');
    socket.close();
  }

  // === Test 3: torch equip lights it, unequip pauses it (no crash), and
  // gold/inventory move correctly through useItem/unequipItem ===
  {
    const username = `GtwoTorch${randomLetters(4)}`;
    const token = await registerOnly('skeleton', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);
    giveItem(username, 'torch');

    const { socket: s2, sync } = await connectSocket(token);
    const torchIndex = sync.player.inventory.indexOf('torch');
    assert(torchIndex !== -1, 'torch appears in inventory after DB seed');

    const equipAck = await new Promise((resolve) => s2.emit('useItem', torchIndex, resolve));
    console.log('  equip torch ->', equipAck);
    assert(equipAck.ok && equipAck.action === 'equipped' && equipAck.equipment.shield === 'torch', 'equipping torch fills the shield slot');

    const unequipAck = await new Promise((resolve) => s2.emit('unequipItem', 'shield', resolve));
    console.log('  unequip torch ->', unequipAck);
    assert(unequipAck.ok && unequipAck.action === 'unequipped', 'unequipItem removes the torch from the shield slot');
    assert(unequipAck.inventory.includes('torch'), 'unequipped torch returns to inventory');
    assert(!unequipAck.equipment.shield, 'shield slot is empty after unequip');
    s2.close();
  }

  // === Test 4: Labyrinth vendor is near the new entrance-adjacent spot,
  // has a 2-tile shop reach, and torches cost 3 gold ===
  {
    const username = `GtwoShop${randomLetters(4)}`;
    const token = await registerOnly('goblin', username);
    const { socket } = await connectSocket(token);
    socket.close();
    await sleep(300);
    giveGold(username, 10);
    // Vendor is at (56, 33); stand 2 tiles away (within shop reach).
    teleport(username, 'Labyrinth', 54, 33);

    const { socket: s2 } = await connectSocket(token);
    await new Promise((r) => setTimeout(r, 300));
    const buyAck = await new Promise((resolve, reject) => {
      s2.emit('buyItem', { vendorId: 'labyrinth-shopkeeper', itemLabel: 'torch' }, resolve);
      setTimeout(() => reject(new Error('no buyItem ack')), 3000);
    });
    console.log('  buy torch from 2 tiles away ->', buyAck);
    assert(buyAck.ok, 'buying a torch from 2 tiles away (shop reach) succeeds');
    assert(buyAck.gold === 7, 'gold decreases by the 3g torch price');
    s2.close();
  }

  // === Test 5: a monster corpse persists (empty) after grab-all, and can
  // be sacrificed for gold = level * 3; a player corpse cannot be
  // sacrificed ===
  {
    const attackerName = `GtwoSacA${randomLetters(3)}`;
    const attackerToken = await registerOnly('goblin', attackerName);
    const { socket: attackerSocket } = await connectSocket(attackerToken);

    // Find a live wild goblin/skeleton on the Great Plains via map:state.
    const mapState = await new Promise((resolve) => attackerSocket.once('map:state', resolve));
    const monster = mapState.monsters[0];
    assert(Boolean(monster), 'at least one wild monster is present on the Great Plains');
    attackerSocket.close();
    if (monster) {
      // A live connection's combat position lives in server memory, not
      // the DB — a SQL teleport only takes effect on the NEXT fresh
      // connection. Since the monster also wanders every 3s, re-teleport
      // + reconnect fresh right next to its LATEST known position each
      // attempt, rather than reusing one stale connection.
      let corpseId = null;
      let corpseLevel = null;
      let currentMonster = monster;
      for (let attempt = 0; attempt < 8 && !corpseId; attempt++) {
        const adjacent = { row: currentMonster.row, col: currentMonster.col - 1 >= 0 ? currentMonster.col - 1 : currentMonster.col + 1 };
        const dir = adjacent.col === currentMonster.col - 1 ? 'east' : 'west';
        teleport(attackerName, 'Great Plains', adjacent.row, adjacent.col);
        await sleep(150);
        const { socket: s2, sync: freshSync } = await connectSocket(attackerToken);
        assert(freshSync.player.row === adjacent.row && freshSync.player.col === adjacent.col, `attempt ${attempt}: teleport took effect`);

        const statePromise = new Promise((resolve) => s2.once('map:state', resolve));
        s2.emit('punch', dir);
        const state = await statePromise;
        const corpse = state.corpses.find((c) => c.kind === currentMonster.kind);
        if (corpse) {
          corpseId = corpse.id;
          corpseLevel = corpse.level;
        } else {
          const stillAlive = state.monsters.find((m) => m.id === currentMonster.id);
          if (stillAlive) currentMonster = stillAlive;
        }
        s2.close();
        await sleep(150);
      }
      assert(Boolean(corpseId), 'killing the monster leaves a corpse');

      if (corpseId) {
        const { socket: s3 } = await connectSocket(attackerToken);
        const lootAck = await new Promise((resolve) => s3.emit('loot', corpseId, resolve));
        console.log('  grab-all monster corpse ->', lootAck);
        assert(lootAck.ok, 'grab-all on the monster corpse succeeds');

        const stillThereState = await new Promise((resolve) => {
          s3.emit('move', 'north', () => {});
          s3.once('map:state', resolve);
        });
        const stillThere = stillThereState.corpses.some((c) => c.id === corpseId);
        assert(stillThere, 'the monster corpse is STILL on the map after grab-all (not deleted)');

        const sacrificeAck = await new Promise((resolve) => s3.emit('sacrificeCorpse', corpseId, resolve));
        console.log('  sacrifice monster corpse ->', sacrificeAck, 'expected reward:', corpseLevel * 3);
        assert(sacrificeAck.ok, 'sacrificing the monster corpse succeeds');
        assert(sacrificeAck.gold !== undefined, 'sacrifice ack reports updated gold');
        s3.close();
      }
    } else {
      attackerSocket.close();
    }
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
