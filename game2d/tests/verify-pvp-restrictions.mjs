// Live verification for item 1: "make it so that player killing is
// possible, but not until the player is level 10 and also they can only
// attack/kill players that are level 10 or higher. Grimoak Castle is
// fully non player killing... [not] in their group."
// Two characters, repositioned/relabeled via SQL between scenarios
// (level, map, party state), each punching the other while adjacent
// (engageInDirection's own 'player' branch — the one real PvP entry
// point in this project) and checking for the expected rejection/
// success message.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME_A = 'PvpTestA' + Math.floor(Math.random() * 1000);
const EMAIL_A = UNAME_A.toLowerCase() + '@example.com';
const CHAR_A = 'Pvptesta' + rand2() + rand2();
const UNAME_B = 'PvpTestB' + Math.floor(Math.random() * 1000);
const EMAIL_B = UNAME_B.toLowerCase() + '@example.com';
const CHAR_B = 'Pvptestb' + rand2() + rand2();

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('POST ' + path + ' failed: ' + JSON.stringify(json));
  return json;
}
function psql(sql) {
  execSync(`docker exec -i game2d-postgres psql -U game2d -d game2d`, { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

// Connects both A and B fresh (picking up whatever SQL state was just
// set), waits for a system chat message on A containing `expectedSubstr`
// (or its absence, if `expectAbsent`), by having A punch B (B is placed
// directly east of A, so A punches 'east').
async function punchAndCheck(accountTokenA, accountTokenB, label, expectedSubstr) {
  const { token: tokenA } = await post(`/characters/${CHAR_A}/select`, {}, accountTokenA);
  const { token: tokenB } = await post(`/characters/${CHAR_B}/select`, {}, accountTokenB);
  const socketA = await connect(tokenA);
  const socketB = await connect(tokenB);
  const messages = [];
  socketA.on('chat', (m) => messages.push(m.message));
  await new Promise((r) => setTimeout(r, 500));
  socketA.emit('punch', 'east');
  await new Promise((r) => setTimeout(r, 500));
  const found = messages.some((m) => m.includes(expectedSubstr));
  check(label, found);
  if (!found) console.log('  (messages seen: ' + JSON.stringify(messages) + ')');
  socketA.close();
  socketB.close();
  await new Promise((r) => setTimeout(r, 300));
}

try {
  const { token: accountTokenA } = await post('/auth/register', { username: UNAME_A, email: EMAIL_A, password: 'testpass123' });
  await post('/characters', { name: CHAR_A, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenA);
  const { token: accountTokenB } = await post('/auth/register', { username: UNAME_B, email: EMAIL_B, password: 'testpass123' });
  await post('/characters', { name: CHAR_B, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenB);

  // Scenario 1: attacker below level 10 -> rejected regardless of target level.
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40, level=5 WHERE username='${CHAR_A}';`);
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=41, level=12 WHERE username='${CHAR_B}';`);
  await punchAndCheck(accountTokenA, accountTokenB, 'attacker below level 10 is rejected', 'must be at least level 10');

  // Scenario 2: attacker eligible, target below level 10 -> rejected.
  psql(`UPDATE players SET level=12 WHERE username='${CHAR_A}';`);
  psql(`UPDATE players SET level=8 WHERE username='${CHAR_B}';`);
  await punchAndCheck(accountTokenA, accountTokenB, 'target below level 10 is rejected', 'not yet eligible to be attacked');

  // Scenario 3: both eligible, on Grimoak Grounds (not the castle) -> a
  // real combat message should appear (hit or avoided), NOT a PvP-restriction message.
  psql(`UPDATE players SET level=12 WHERE username='${CHAR_A}';`);
  psql(`UPDATE players SET level=12 WHERE username='${CHAR_B}';`);
  {
    const { token: tokenA } = await post(`/characters/${CHAR_A}/select`, {}, accountTokenA);
    const { token: tokenB } = await post(`/characters/${CHAR_B}/select`, {}, accountTokenB);
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const messages = [];
    socketA.on('chat', (m) => messages.push(m.message));
    await new Promise((r) => setTimeout(r, 500));
    socketA.emit('punch', 'east');
    await new Promise((r) => setTimeout(r, 500));
    const gotPvpRejection = messages.some((m) => m.includes('level 10') || m.includes('Grimoak Castle') || m.includes('your party'));
    check('both eligible, outside castle, not partied -> attack is NOT rejected', !gotPvpRejection);
    socketA.close();
    socketB.close();
    await new Promise((r) => setTimeout(r, 300));
  }

  // Scenario 4: both eligible, inside Grimoak Castle -> rejected.
  psql(`UPDATE players SET map='Grimoak Entrance Hall', "row"=10, col=25 WHERE username='${CHAR_A}';`);
  psql(`UPDATE players SET map='Grimoak Entrance Hall', "row"=10, col=26 WHERE username='${CHAR_B}';`);
  await punchAndCheck(accountTokenA, accountTokenB, 'attack inside Grimoak Castle is rejected', 'Grimoak Castle');

  // Scenario 5: both eligible, outside castle, but in the same party -> rejected.
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=40 WHERE username='${CHAR_A}';`);
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=41 WHERE username='${CHAR_B}';`);
  {
    const { token: tokenA } = await post(`/characters/${CHAR_A}/select`, {}, accountTokenA);
    const { token: tokenB } = await post(`/characters/${CHAR_B}/select`, {}, accountTokenB);
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const messagesA = [];
    const messagesB = [];
    socketA.on('chat', (m) => messagesA.push(m.message));
    socketB.on('chat', (m) => messagesB.push(m.message));
    await new Promise((r) => setTimeout(r, 500));
    socketA.emit('chat', `/invite ${CHAR_B}`);
    await new Promise((r) => setTimeout(r, 400));
    check('B received a party invite notice', messagesB.some((m) => m.includes('invited you to their party')));
    socketB.emit('chat', '/accept');
    await new Promise((r) => setTimeout(r, 400));
    check('A saw B join the party', messagesA.some((m) => m.includes('has joined the party')));

    messagesA.length = 0;
    socketA.emit('punch', 'east');
    await new Promise((r) => setTimeout(r, 500));
    check('party member attack is rejected', messagesA.some((m) => m.includes('your party')));

    // /leave should dissolve it back down and re-allow the attack.
    socketA.emit('chat', '/leave');
    await new Promise((r) => setTimeout(r, 400));
    messagesA.length = 0;
    socketA.emit('punch', 'east');
    await new Promise((r) => setTimeout(r, 500));
    const gotPvpRejection = messagesA.some((m) => m.includes('level 10') || m.includes('Grimoak Castle') || m.includes('your party'));
    check('after /leave, attack is no longer rejected', !gotPvpRejection);

    socketA.close();
    socketB.close();
    await new Promise((r) => setTimeout(r, 300));
  }
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(
      `DELETE FROM players WHERE username IN ('${CHAR_A}', '${CHAR_B}'); DELETE FROM accounts WHERE username IN ('${UNAME_A}', '${UNAME_B}');`
    );
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
