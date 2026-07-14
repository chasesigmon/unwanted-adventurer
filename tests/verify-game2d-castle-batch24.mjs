// Live verification for this 3-item batch: the castle's 3 new upper
// floors (stairs both ways, 10 specialization chambers with teachers),
// the new town of Bramwick north of Grimoak Grounds (4 shops with
// shopkeepers), and floor 4's decorative portals (collision-blocked, no
// real exits).
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch24.mjs` from the repo root.
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

async function postJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    let sync, mapState;
    socket.once('sync', (s) => (sync = s));
    socket.once('map:state', (m) => (mapState = m));
    socket.once('connect_error', reject);
    const timer = setInterval(() => {
      if (sync && mapState) {
        clearInterval(timer);
        resolve({ socket, sync, mapState });
      }
    }, 25);
    setTimeout(() => {
      clearInterval(timer);
      reject(new Error('sync/map:state timeout'));
    }, 5000);
  });
}

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

async function registerAndSpawn(prefix) {
  const email = `${prefix}${randomLetters(6)}@example.com`;
  const acctUsername = `${prefix[0].toUpperCase()}${prefix.slice(1)}${randomLetters(5)}`;
  const charName = `${prefix[0].toUpperCase()}${prefix.slice(1)}c${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'male', hairColor: 'black', skinTone: 'white' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync, mapState } = await connectSocket(select.body.token);
  return { charName, token: select.body.token, socket, sync, mapState };
}

async function main() {
  const owner = await registerAndSpawn('batchy');

  // === Item 1: castle upper floors — stairs up from the Entrance Hall,
  // 5 chambers per floor (each with its own teacher), stairs back down,
  // and floor 2 -> floor 3 -> floor 4. ===
  // handleDisconnect's own persistPosition writes the socket's stale
  // in-memory row/col back to the DB on close — close FIRST, then the
  // SQL update, then reconnect (an established test-harness gotcha from
  // earlier batches), everywhere positioning happens below.
  owner.socket.close();
  await sleep(300);
  sql(`UPDATE players SET map='Grimoak Entrance Hall', row=33, col=18 WHERE username='${owner.charName}';`);
  await sleep(300);
  let { socket } = await connectSocket(owner.token);

  const upToFloor2 = await emitWithAck(socket, 'move', 'south');
  console.log('  Entrance Hall stairs up ->', upToFloor2.ok, upToFloor2.player?.map);
  assert(upToFloor2.ok === true && upToFloor2.player.map === 'Grimoak Castle 2nd Floor', 'stairs up from the Entrance Hall lead to the 2nd floor');

  const floor2Chambers = [
    { col: 4, name: 'Necromancer Chamber', teacher: 'Professor Voss' },
    { col: 8, name: 'Enhancer Chamber', teacher: 'Professor Brann' },
    { col: 12, name: 'Elementalist Chamber', teacher: 'Professor Tempest' },
    { col: 16, name: 'Summoner Chamber', teacher: 'Professor Corvin' },
    { col: 20, name: 'Illusionist Chamber', teacher: 'Professor Mirelle' },
  ];
  for (const { col, name, teacher } of floor2Chambers) {
    socket.close();
    await sleep(250);
    sql(`UPDATE players SET map='Grimoak Castle 2nd Floor', row=0, col=${col} WHERE username='${owner.charName}';`);
    await sleep(250);
    ({ socket } = await connectSocket(owner.token));
    const enterAck = await emitWithAck(socket, 'move', 'north');
    console.log(`  entering ${name} ->`, enterAck.ok, enterAck.player?.map);
    assert(enterAck.ok === true && enterAck.player.map === name, `floor 2 chamber door at col ${col} leads to ${name}`);
    socket.close();
    await sleep(250);
    const { socket: scoutSock, mapState: freshState } = await connectSocket(owner.token);
    scoutSock.close();
    const hasTeacher = freshState.teachers?.some((t) => t.name === teacher);
    assert(hasTeacher, `${name} has its own teacher (${teacher})`);
  }

  // Back to the floor 2 landing, then up to floor 3.
  socket.close();
  await sleep(250);
  sql(`UPDATE players SET map='Grimoak Castle 2nd Floor', row=16, col=19 WHERE username='${owner.charName}';`);
  await sleep(250);
  ({ socket } = await connectSocket(owner.token));
  const upToFloor3 = await emitWithAck(socket, 'move', 'south');
  console.log('  floor 2 stairs up ->', upToFloor3.ok, upToFloor3.player?.map);
  assert(upToFloor3.ok === true && upToFloor3.player.map === 'Grimoak Castle 3rd Floor', 'stairs up from floor 2 lead to floor 3');

  const floor3Chambers = [
    { col: 4, name: 'Battlemage Chamber', teacher: 'Professor Draven' },
    { col: 20, name: 'Hemomancer Chamber', teacher: 'Professor Vex' },
  ];
  for (const { col, name, teacher } of floor3Chambers) {
    socket.close();
    await sleep(250);
    sql(`UPDATE players SET map='Grimoak Castle 3rd Floor', row=0, col=${col} WHERE username='${owner.charName}';`);
    await sleep(250);
    ({ socket } = await connectSocket(owner.token));
    const enterAck = await emitWithAck(socket, 'move', 'north');
    console.log(`  entering ${name} ->`, enterAck.ok, enterAck.player?.map);
    assert(enterAck.ok === true && enterAck.player.map === name, `floor 3 chamber door at col ${col} leads to ${name}`);
    socket.close();
    await sleep(250);
    const { socket: scoutSock, mapState: freshState } = await connectSocket(owner.token);
    scoutSock.close();
    const hasTeacher = freshState.teachers?.some((t) => t.name === teacher);
    assert(hasTeacher, `${name} has its own teacher (${teacher})`);
  }

  // Back to floor 3 landing, up to floor 4, confirm floor 4 has no
  // chamber doors (moving 'north' from anywhere on its own row 0 should
  // just be a normal in-room move, not a transition) and its portals
  // block movement.
  socket.close();
  await sleep(250);
  sql(`UPDATE players SET map='Grimoak Castle 3rd Floor', row=16, col=19 WHERE username='${owner.charName}';`);
  await sleep(250);
  ({ socket } = await connectSocket(owner.token));
  const upToFloor4 = await emitWithAck(socket, 'move', 'south');
  console.log('  floor 3 stairs up ->', upToFloor4.ok, upToFloor4.player?.map);
  assert(upToFloor4.ok === true && upToFloor4.player.map === 'Grimoak Castle 4th Floor', 'stairs up from floor 3 lead to floor 4');

  // Floor 4's own north-wall portal sits at (0, FLOOR_LANDING_MID_ROW+4=12).
  // Standing one tile south of it and moving north should be BLOCKED
  // (occupied, not a real exit) rather than transitioning anywhere.
  socket.close();
  await sleep(250);
  sql(`UPDATE players SET row=1, col=12 WHERE username='${owner.charName}';`);
  await sleep(250);
  ({ socket } = await connectSocket(owner.token));
  const intoPortal = await emitWithAck(socket, 'move', 'north');
  console.log('  moving into floor 4\'s north portal ->', intoPortal.ok, intoPortal.message);
  assert(intoPortal.ok === false, "floor 4's own portal blocks movement (occupied tile, not a real transition)");

  // Back down floor4 -> floor3 -> floor2 -> Entrance Hall, confirming
  // every down-stairs works.
  socket.close();
  await sleep(250);
  sql(`UPDATE players SET row=16, col=6 WHERE username='${owner.charName}';`);
  await sleep(250);
  ({ socket } = await connectSocket(owner.token));
  const downToFloor3 = await emitWithAck(socket, 'move', 'south');
  assert(downToFloor3.ok === true && downToFloor3.player.map === 'Grimoak Castle 3rd Floor', 'floor 4 down-stairs leads back to floor 3');
  socket.close();

  // === Item 2: Bramwick, north of Grimoak Grounds, with its 4 shops ===
  await sleep(250);
  sql(`UPDATE players SET map='Grimoak Grounds', row=0, col=40 WHERE username='${owner.charName}';`);
  await sleep(250);
  ({ socket } = await connectSocket(owner.token));
  const intoBramwick = await emitWithAck(socket, 'move', 'north');
  console.log('  Grimoak Grounds north exit ->', intoBramwick.ok, intoBramwick.player?.map);
  assert(intoBramwick.ok === true && intoBramwick.player.map === 'Bramwick', "Grimoak Grounds' new north exit leads to Bramwick");

  const bramwickShops = [
    { row: 10, col: 10, name: 'Bramwick General Shop', vendor: 'General Shop' },
    { row: 10, col: 30, name: 'Bramwick Wands', vendor: 'Wandmaker' },
    { row: 28, col: 10, name: 'Bramwick Armor', vendor: 'Armorer' },
    { row: 28, col: 30, name: 'Bramwick Potions', vendor: 'Potioneer' },
  ];
  for (const { row, col, name, vendor } of bramwickShops) {
    socket.close();
    await sleep(250);
    sql(`UPDATE players SET map='Bramwick', row=${row}, col=${col} WHERE username='${owner.charName}';`);
    await sleep(250);
    ({ socket } = await connectSocket(owner.token));
    const enterAck = await emitWithAck(socket, 'move', 'north');
    console.log(`  entering ${name} ->`, enterAck.ok, enterAck.player?.map);
    assert(enterAck.ok === true && enterAck.player.map === name, `Bramwick's shop door at (${row},${col}) leads to ${name}`);
    socket.close();
    await sleep(250);
    const { socket: scoutSock, mapState: freshState } = await connectSocket(owner.token);
    scoutSock.close();
    const hasVendor = freshState.vendors?.some((v) => v.name.includes(vendor));
    assert(hasVendor, `${name} has a shopkeeper (${vendor})`);
  }

  socket.close();
  sql(`DELETE FROM players WHERE username = '${owner.charName}';`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
