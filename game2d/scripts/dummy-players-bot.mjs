// Item 4's own persistent bot: "add about 10 dummy players scattered
// across grimoak grounds... " — per the user's explicit choice, these are
// REAL logged-in characters (not decorative NPCs), which only show up in
// map:state while their own socket stays connected (see
// WorldManagerService.getMapState, which iterates live connections, not
// the players table). This process's only job is to log each of the 10
// accounts in (see tests/setup-dummy-players.mjs for how they were
// created) and hold the connection open indefinitely so they're always
// visible standing in Grimoak Grounds, reconnecting automatically if the
// server restarts or a connection drops.
//
// Run with: node scripts/dummy-players-bot.mjs
// Keep it running in the background for as long as the dummy players
// should stay online — killing this process logs all 10 of them off.
import { io } from 'socket.io-client';
import { DUMMY_PLAYERS } from '../tests/setup-dummy-players.mjs';

const BASE = process.env.GAME2D_BASE_URL ?? 'http://localhost:3001';
const PASSWORD = 'dummyplayer123';
const RECONNECT_DELAY_MS = 10_000;

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`POST ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

async function connectOne(name) {
  const uname = 'Dummy' + name;
  for (;;) {
    try {
      const { token: accountToken } = await post('/auth/login', { username: uname, password: PASSWORD });
      const { token: charToken } = await post(`/characters/${name}/select`, {}, accountToken);
      const socket = io(BASE, { auth: { token: charToken }, transports: ['websocket'] });
      socket.on('connect', () => console.log(`[${name}] connected`));
      socket.on('disconnect', (reason) => console.log(`[${name}] disconnected (${reason}) — will reconnect`));
      socket.on('connect_error', (err) => console.log(`[${name}] connect_error: ${err.message}`));
      return;
    } catch (err) {
      console.error(`[${name}] login failed, retrying in ${RECONNECT_DELAY_MS / 1000}s:`, err.message);
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }
  }
}

for (const dp of DUMMY_PLAYERS) {
  await connectOne(dp.name);
  // A small stagger between logins — same "don't hammer the server with
  // 10 simultaneous connects" courtesy every other multi-account test
  // script in this project already follows.
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\nAll ${DUMMY_PLAYERS.length} dummy players are online. Leave this process running to keep them visible.`);
