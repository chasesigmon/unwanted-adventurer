// Items 7/8: "make the stairs in Grimoak Castle a little wider on each
// floor" + "make an update to the stairs on the 2nd floor and instead of
// them being to the south, put them on the north wall... between Shaman
// and Elementalist... also move the door on the 4th floor to the north
// wall in the same position as the door on the 2nd floor."
//
// This test walks the actual transitions server-side, IN ONE CONTINUOUS
// session (reconnecting with the same character mid-test was found to
// occasionally read a stale cached position from WorldManagerService --
// a real quirk of rapid reconnects, not of this change -- so this stays
// on one socket throughout, exactly like a real player walking around):
//  - Floor 2's new north-wall stairs (row 0, col 10) -> Floor 3, landing
//    at floor 3's own down-stairs arrival point (unchanged destination).
//  - Walking further south from there (now on floor 3's own down-stairs
//    tile) lands back on floor 2 at the NEW north-wall position (row 1,
//    col 10), not the old south-wall spot.
//  - The OLD south-wall position on floor 2 (row 16, col 19) no longer
//    transitions anywhere (checked via a fresh connection, since nothing
//    about that path depends on continuity).
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
function move(socket, direction) {
  return new Promise((resolve, reject) => socket.timeout(5000).emit('move', direction, (err, res) => (err ? reject(err) : resolve(res))));
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const CHAR = 'St' + randomLetters(8);
const UNAME = ('St' + randomLetters(8)).slice(0, 16);
const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

// Start standing right on floor 2's new north-wall stairs tile.
psql(`UPDATE players SET map='Grimoak Castle 2nd Floor', "row"=0, col=10 WHERE username='${CHAR}';`);
const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

const upAck = await move(socket, 'north');
console.log('floor2 north-wall stairs -> up ack:', JSON.stringify({ ok: upAck.ok, map: upAck.player?.map, row: upAck.player?.row, col: upAck.player?.col }));
check('walking north off floor 2s new stairs tile (row0,col10) transitions to floor 3', upAck.player?.map === 'Grimoak Castle 3rd Floor', JSON.stringify(upAck.player));
check('lands at floor 3s own down-stairs arrival point (row15,col6), unchanged destination', upAck.player?.row === 15 && upAck.player?.col === 6, `row=${upAck.player?.row} col=${upAck.player?.col}`);

// Walk one tile further south (an ordinary in-bounds move) to actually
// reach floor 3's down-stairs tile itself (row 16), then move south AGAIN
// to trigger the exit back down.
const stepAck = await move(socket, 'south');
check('an ordinary move south reaches floor 3s down-stairs tile (row16,col6)', stepAck.player?.row === 16 && stepAck.player?.col === 6 && stepAck.player?.map === 'Grimoak Castle 3rd Floor', JSON.stringify(stepAck.player));

const downAck = await move(socket, 'south');
console.log('floor3 down-stairs -> down ack:', JSON.stringify({ ok: downAck.ok, map: downAck.player?.map, row: downAck.player?.row, col: downAck.player?.col }));
check('walking south off floor 3s down-stairs tile transitions to floor 2', downAck.player?.map === 'Grimoak Castle 2nd Floor', JSON.stringify(downAck.player));
check('lands at floor 2s NEW north-wall position (row1,col10), not the old south-wall spot', downAck.player?.row === 1 && downAck.player?.col === 10, `row=${downAck.player?.row} col=${downAck.player?.col}`);

socket.close();

// The OLD south-wall position on floor 2 (row16,col19) should no longer
// transition anywhere -- just an ordinary floor tile now. Independent
// scenario/fresh character, so a brand-new connection is fine here.
const CHAR2 = 'St' + randomLetters(8);
const UNAME2 = ('St' + randomLetters(8)).slice(0, 16);
const { token: accountToken2 } = await post('/auth/register', { username: UNAME2, email: `${UNAME2}@example.com`.toLowerCase(), password: 'testpass123' });
await post('/characters', { name: CHAR2, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken2);
psql(`UPDATE players SET map='Grimoak Castle 2nd Floor', "row"=16, col=19 WHERE username='${CHAR2}';`);
const { token: charToken2 } = await post(`/characters/${CHAR2}/select`, {}, accountToken2);
const socket2 = await connect(charToken2);
const staleAck = await move(socket2, 'south');
console.log('floor2 OLD south-wall spot -> move ack:', JSON.stringify({ ok: staleAck.ok, map: staleAck.player?.map, row: staleAck.player?.row, col: staleAck.player?.col, message: staleAck.message }));
check('the old south-wall exit is gone -- still on floor 2, no transition', staleAck.player?.map === 'Grimoak Castle 2nd Floor' && staleAck.player?.row === 16 && staleAck.player?.col === 19, JSON.stringify(staleAck.player));

socket2.close();
psql(`DELETE FROM players WHERE username='${CHAR}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
psql(`DELETE FROM players WHERE username='${CHAR2}';`);
psql(`DELETE FROM accounts WHERE username='${UNAME2}';`);

process.exit(failures > 0 ? 1 : 0);
