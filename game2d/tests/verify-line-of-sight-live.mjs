// Live end-to-end companion to verify-line-of-sight.mjs's pure unit test:
// actually casts a real ranged spell (stun) at a real player positioned on
// the OTHER side of a known labyrinth wall tile, confirming the server
// rejects it with the new "no clear line of sight" message -- then
// confirms the SAME spell at the SAME range, but with a clear path (no
// wall), passes the line-of-sight gate (gets past it to the real
// mana-check, not stopped by "too far"/"no line of sight").
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}
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
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect_error', (err) => reject(err));
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
async function makeCharacter(prefix, row, col) {
  const CHAR = prefix + randomLetters(8);
  const UNAME = (prefix + randomLetters(8)).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(
    `UPDATE players SET map='Labyrinth', "row"=${row}, col=${col}, level=10, mana=200, max_mana=200, skills = skills || '{"stun": 100}'::jsonb, equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${CHAR}';`
  );
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  return { CHAR, UNAME, charToken };
}
function cleanup({ CHAR, UNAME }) {
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// Same wall found by verify-line-of-sight.mjs's own programmatic search:
// a real labyrinth wall tile at (1,3), open floor at (1,1) and (1,5).
const WALL_ROW = 1;
const OPEN_WEST_COL = 1;
const OPEN_EAST_COL = 5;

const caster = await makeCharacter('LsC', WALL_ROW, OPEN_WEST_COL);
const targetBehindWall = await makeCharacter('LsT', WALL_ROW, OPEN_EAST_COL);

const casterSocket = await connect(caster.charToken);
const targetSocket = await connect(targetBehindWall.charToken);

const blockedAck = await new Promise((resolve, reject) =>
  casterSocket.timeout(5000).emit('castStupefaciunt', { targetKind: 'player', targetId: targetBehindWall.CHAR }, (err, res) => (err ? reject(err) : resolve(res)))
);
console.log('cast across the wall:', JSON.stringify(blockedAck));
check('a ranged attack across a real labyrinth wall is rejected', blockedAck.ok === false, JSON.stringify(blockedAck));
check('rejected specifically for lack of line of sight (not just range)', blockedAck.message === "You don't have a clear line of sight to that.", blockedAck.message);

targetSocket.close();
casterSocket.close();
await new Promise((r) => setTimeout(r, 300));

// Now move the target to be adjacent to the caster (same side of the
// wall, no obstruction) and confirm the SAME spell gets PAST the
// line-of-sight gate (any other outcome -- fumble, success -- proves it
// wasn't blocked by sight/range).
psql(`UPDATE players SET "row"=${WALL_ROW}, col=${OPEN_WEST_COL + 1} WHERE username='${targetBehindWall.CHAR}';`);
const casterSocket2 = await connect(caster.charToken);
const targetSocket2 = await connect(targetBehindWall.charToken);
const clearAck = await new Promise((resolve, reject) =>
  casterSocket2.timeout(5000).emit('castStupefaciunt', { targetKind: 'player', targetId: targetBehindWall.CHAR }, (err, res) => (err ? reject(err) : resolve(res)))
);
console.log('cast with a clear path:', JSON.stringify(clearAck));
check('the same spell at close range with a clear path is NOT blocked by line of sight', clearAck.message !== "You don't have a clear line of sight to that.", JSON.stringify(clearAck));
check('...and actually succeeds (100% skill, no cooldown yet)', clearAck.ok === true, JSON.stringify(clearAck));

casterSocket2.close();
targetSocket2.close();
cleanup(caster);
cleanup(targetBehindWall);

process.exit(failures > 0 ? 1 : 0);
