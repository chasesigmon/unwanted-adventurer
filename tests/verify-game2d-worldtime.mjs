// Live socket-driven verification for the world-clock persistence fix:
// a fresh connection should immediately receive a 'worldTime' push (not
// wait up to 40s for the next stat tick), and a truly fresh world (no
// persisted hour in Redis yet) should start at "start of day" rather than
// midnight.
//
// Requires `npm run dev:server` running inside game2d/ (backend on
// :3001), the game2d-postgres container up, and Redis reachable at the
// configured REDIS_URL. Run with `node tests/verify-game2d-worldtime.mjs`
// from the repo root.
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

async function main() {
  const username = `GtwoClock${randomLetters(4)}`;
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, race: 'skeleton' }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`register failed: ${JSON.stringify(body)}`);

  const socket = io(BASE, { auth: { token: body.token }, transports: ['websocket'] });
  const worldTimeReceived = new Promise((resolve) => socket.once('worldTime', resolve));
  const syncReceived = new Promise((resolve) => socket.once('sync', resolve));

  const [sync, worldTime] = await Promise.all([
    syncReceived,
    Promise.race([worldTimeReceived, new Promise((resolve) => setTimeout(() => resolve(null), 3000))]),
  ]);

  console.log('sync ->', sync.player.username, sync.player.race);
  console.log('worldTime (within 3s of connect) ->', worldTime);

  assert(sync.player.race === 'skeleton', 'registered skeleton syncs with the correct race immediately');
  assert(worldTime !== null, 'a fresh connection receives worldTime within 3s (not a 30-40s wait)');
  if (worldTime) {
    assert(worldTime.hour >= 0 && worldTime.hour < 24, 'worldTime.hour is a valid hour');
    console.log(`  (hour ${worldTime.hour} — expect 8 on a truly fresh world with nothing persisted yet)`);
  }

  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
