// Live verification for items 2 and 3: a player-kill corpse should no
// longer carry a guaranteed "body part" item (a lock of hair for a
// human, with a misleading "right-click to consume" hint) — instead it
// should carry the DEFEATED player's own full inventory AND equipment, a
// real transfer (the victim's own copies are cleared, not duplicated).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME_A = 'DeathA' + Math.floor(Math.random() * 1000);
const EMAIL_A = UNAME_A.toLowerCase() + '@example.com';
const CHAR_A = 'Deatha' + rand2() + rand2();
const UNAME_B = 'DeathB' + Math.floor(Math.random() * 1000);
const EMAIL_B = UNAME_B.toLowerCase() + '@example.com';
const CHAR_B = 'Deathb' + rand2() + rand2();

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

let socketA;
let socketB;
try {
  const { token: accountTokenA } = await post('/auth/register', { username: UNAME_A, email: EMAIL_A, password: 'testpass123' });
  await post('/characters', { name: CHAR_A, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenA);
  const { token: accountTokenB } = await post('/auth/register', { username: UNAME_B, email: EMAIL_B, password: 'testpass123' });
  await post('/characters', { name: CHAR_B, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenB);

  psql(
    `UPDATE players SET map='Grimoak Grounds', "row"=63, col=40, level=15, mana=100, max_mana=100, skills='{"arcane bolt": 100}' WHERE username='${CHAR_A}';`
  );
  psql(
    `UPDATE players SET map='Grimoak Grounds', "row"=63, col=41, level=15, hp=1, max_hp=1, inventory='["hp potion", "mp potion", "canteen"]'::jsonb, equipment='{"weapon": "wand", "shield": "bone shield"}'::jsonb WHERE username='${CHAR_B}';`
  );

  const { token: tokenA } = await post(`/characters/${CHAR_A}/select`, {}, accountTokenA);
  const { token: tokenB } = await post(`/characters/${CHAR_B}/select`, {}, accountTokenB);
  socketA = await connect(tokenA);
  socketB = await connect(tokenB);
  let latestMapStateA = null;
  socketA.on('map:state', (data) => (latestMapStateA = data));
  await new Promise((r) => setTimeout(r, 700));

  const killAck = await new Promise((resolve) => socketA.emit('castAugue', { targetKind: 'player', targetId: CHAR_B }, resolve));
  console.log('kill ack:', JSON.stringify(killAck));
  check('the kill lands (B has only 1 hp)', killAck.ok === true);
  await new Promise((r) => setTimeout(r, 500));

  const corpse = latestMapStateA?.corpses?.find((c) => c.killedBy === CHAR_A);
  check('a corpse appears for the killed player', Boolean(corpse));
  if (corpse) {
    console.log('corpse items:', JSON.stringify(corpse.items));
    check('corpse has NO body-part item (no "lock of hair")', !corpse.items.includes('lock of hair'));
    check('corpse carries the victim\'s inventory (hp potion, mp potion, canteen)', ['hp potion', 'mp potion', 'canteen'].every((i) => corpse.items.includes(i)));
    check('corpse carries the victim\'s equipment (wand, bone shield)', ['wand', 'bone shield'].every((i) => corpse.items.includes(i)));
  }

  // Confirm B's own inventory/equipment were actually cleared (a real
  // transfer, not a duplicate free copy).
  const row = execSync(
    `docker exec -i game2d-postgres psql -U game2d -d game2d -t -A -c "SELECT inventory, equipment FROM players WHERE username='${CHAR_B}';"`
  )
    .toString()
    .trim();
  console.log('B row after death:', row);
  check("victim's own inventory/equipment were cleared (real transfer)", row === '[]|{}');

  socketA.close();
  socketB.close();
} catch (err) {
  console.error('FAIL (exception):', err);
  allPass = false;
} finally {
  try {
    socketA?.close();
    socketB?.close();
    await new Promise((r) => setTimeout(r, 300));
    psql(
      `DELETE FROM players WHERE username IN ('${CHAR_A}', '${CHAR_B}'); DELETE FROM accounts WHERE username IN ('${UNAME_A}', '${UNAME_B}');`
    );
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exitCode = allPass ? 0 : 1;
