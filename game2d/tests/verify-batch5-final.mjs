// Live verification for the follow-up batch: shop counter collision (1),
// shop building collision (2), Grimoak Grounds <-> Road to Kortho/Floro
// signs (3/5, client-only — not checked here), full-width road band
// transitions (4), Floro shop sprite/parity (6), recall list additions
// (7), world-map ASCII dropdown (8, client-only), and the new square/
// rectangle shop grid (9).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME = 'Batch5Test' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Batchfivetest' + rand2() + rand2();

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
function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
async function closeAndWait(socket) {
  socket.close();
  await new Promise((r) => setTimeout(r, 400));
}

let allPass = true;
function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  if (!cond) allPass = false;
}

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

  // --- Item 4: full-width road band — enter Road to Kortho from an
  // OFFSET row (8, not the exact old center 10), which used to be
  // rejected with "You can't go that way".
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=8, col=98, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  let res = await emit(socket, 'move', 'east');
  check('steps onto the Road to Kortho band at an OFFSET row (8, not center)', res.ok === true && res.player?.map === 'Grimoak Grounds');
  res = await emit(socket, 'move', 'east');
  // Offset is preserved relative to each side's OWN center (10 on the
  // Grounds side, 11 on Road to Kortho's own side) — a -2 offset from 10
  // lands at 11-2=9, not the same raw row number.
  check('full-width band transitions at offset row too (item 4)', res.ok === true && res.player?.map === 'Road to Kortho');
  check('lands at the matching (relative-offset) row on the other side', res.player?.row === 9);

  // --- Item 4 (Floro road too): offset column instead of center ---
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=86, col=8, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));
  res = await emit(socket, 'move', 'south');
  check('steps onto the Road to Floro band at an OFFSET col (8, not center 10)', res.ok === true && res.player?.map === 'Grimoak Grounds');
  res = await emit(socket, 'move', 'south');
  check('full-width band transitions at offset col too (item 4)', res.ok === true && res.player?.map === 'Road to Floro');
  check('lands at the matching (relative-offset) col on the other side', res.player?.col === 10);

  // --- Item 7: recall list — Kortho should now be a visited POI. Must
  // be a REAL transition (walking in from Road to Kortho), not a raw SQL
  // teleport, since the recall-visited check only fires on `transitioned`.
  await closeAndWait(socket);
  psql(
    `UPDATE players SET map='Road to Kortho', "row"=11, col=98, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`
  );
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));
  res = await emit(socket, 'move', 'east');
  res = await emit(socket, 'move', 'east');
  console.log('visitedPois after entering Kortho:', JSON.stringify(res.player?.visitedPois), 'map:', res.player?.map);
  check('entering Kortho adds it to the recall list', (res.player?.visitedPois || []).includes('kortho'));

  // --- Item 9: rearranged shop grid — Blacksmith door now at (15, 10).
  // Stand SOUTH of the door (row 16) and step onto it, then trigger.
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Kortho', "row"=16, col=10, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));

  res = await emit(socket, 'move', 'north');
  check('steps onto the Blacksmith door tile (row 15)', res.ok === true && res.player?.map === 'Kortho' && res.player?.row === 15);
  res = await emit(socket, 'move', 'north');
  check('Kortho Blacksmith door (new grid position) leads inside', res.ok === true && res.player?.map === 'Kortho Blacksmith');
  check('arrives at the interior door tile', res.player?.row === 29 && res.player?.col === 15);

  // Now check the building's OWN wall has real collision from the street
  // side: stand just south of a DIFFERENT column within the same
  // building's footprint (col 8, still within cols 7-12) and try to walk
  // north into the wall.
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Kortho', "row"=14, col=8, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));
  res = await emit(socket, 'move', 'north');
  console.log('walking into the Blacksmith building wall (not the door):', JSON.stringify(res).slice(0, 200));
  check('the building wall (off-door column) now blocks movement', res.ok === false);

  // --- Item 1: vendor counter collision — inside the Blacksmith, the
  // counter now spans 5 columns (13-17) at row 4; walking onto an OFF-
  // CENTER counter tile (col 13, not the vendor's own col 15) should
  // also be blocked, confirming the WIDER footprint (not just 1 tile).
  await closeAndWait(socket);
  psql(`UPDATE players SET map='Kortho Blacksmith', "row"=5, col=13, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`);
  ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
  socket = await connect(charToken);
  await new Promise((r) => setTimeout(r, 700));
  res = await emit(socket, 'move', 'north');
  console.log('walking onto an off-center counter tile:', JSON.stringify(res).slice(0, 200));
  check('the wider counter footprint blocks an off-center tile too (item 1)', res.ok === false);

  // Buying still works from the correct reach distance.
  res = await emit(socket, 'move', 'east');
  const buyRes = await emit(socket, 'buyItem', { vendorId: 'kortho-blacksmith', itemLabel: 'bone dagger' });
  console.log('buy response after rearrangement:', JSON.stringify(buyRes).slice(0, 200));
  check('buying from Kortho Blacksmith still works after the rearrangement', buyRes.ok === true);

  socket.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
