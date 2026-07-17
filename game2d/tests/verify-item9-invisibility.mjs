// Live verification for item 9: "when the player goes invisible and then
// attacks again for any reason (auto attack...), they should become
// visible once they make the first hit." Engages a monster first (so an
// auto-attack session is already running), THEN casts invisibility
// mid-fight, and confirms the very next auto-resolved hit breaks it.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Item9Test' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Ninetest' + rand2() + rand2();

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

try {
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(
    `UPDATE players SET level=20, "row"=63, col=40, map='Grimoak Grounds', equipment='{"weapon":"wand"}', skills='{"punch": 100, "invisibility": 100}', specialization='illusionist', mana=200, max_mana=200, hp=500, max_hp=500 WHERE username='${CHAR}';`
  );

  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);
  let latestMapState = null;
  let latestPlayer = null;
  socket.on('map:state', (data) => (latestMapState = data));
  socket.on('sync', (data) => {
    if (data.player) latestPlayer = data.player;
  });
  await new Promise((r) => setTimeout(r, 800));

  const imp = latestMapState?.monsters?.find((m) => m.kind === 'imp' && !m.isRare);
  check('an imp is present', Boolean(imp));
  console.log('captured imp:', imp ? `id=${imp.id} pos=(${imp.row},${imp.col})` : 'none');
  if (imp) {
    socket.close();
    await new Promise((r) => setTimeout(r, 400));
    psql(`UPDATE players SET "row"=${imp.row}, col=${imp.col + 1} WHERE username='${CHAR}';`);
    ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
    socket = await connect(charToken);
    socket.on('map:state', (data) => (latestMapState = data));
    socket.on('sync', (data) => {
      if (data.player) latestPlayer = data.player;
    });
    await new Promise((r) => setTimeout(r, 500));
    console.log(
      'after reconnect: playerPos=',
      `(${latestPlayer?.row},${latestPlayer?.col})`,
      'imp still at map:state?',
      latestMapState?.monsters?.find((m) => m.id === imp.id) ? 'yes' : 'no',
      'total monsters in state:',
      latestMapState?.monsters?.length
    );

    // Engage an ongoing auto-attack session first — the wand's own
    // ranged auto-attack (much more generous range than melee) rather
    // than a punch, since losing aggro the instant invisibility casts
    // (see handleCastInvisibility's own clearAllAggroOnto — correct,
    // "monsters can't see the player while invisible") lets the imp
    // wander off on its own for a few tiles before this check even runs,
    // which would otherwise take the target out of melee range entirely
    // before a 2nd hit ever gets a chance to fire.
    const engageAck = await new Promise((resolve) => socket.emit('engageRangedAttack', { targetKind: 'monster', targetId: imp.id }, resolve));
    console.log('engageRangedAttack ack:', JSON.stringify(engageAck));
    await new Promise((r) => setTimeout(r, 400));

    // Now cast invisibility WHILE that session is still active.
    const invisAck = await new Promise((resolve) => socket.emit('castInvisibility', resolve));
    console.log('castInvisibility ack:', JSON.stringify(invisAck));
    check('invisibility cast succeeded', invisAck.ok);
    await new Promise((r) => setTimeout(r, 200));
    check('player is now invisible', latestPlayer?.invisibleActive === true);

    // Wait for the next auto-attack hit to land (should break it).
    let brokeInvisibility = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const currentImp = latestMapState?.monsters?.find((m) => m.id === imp.id);
      if (i % 3 === 0) {
        console.log(
          `t=${(i + 1) * 300}ms invisibleActive=${latestPlayer?.invisibleActive} playerPos=(${latestPlayer?.row},${latestPlayer?.col}) imp=${currentImp ? `hp=${currentImp.hp} pos=(${currentImp.row},${currentImp.col})` : 'gone'}`
        );
      }
      if (latestPlayer?.invisibleActive === false) {
        brokeInvisibility = true;
        console.log(`invisibility broke after ~${(i + 1) * 300}ms of continued auto-attack`);
        break;
      }
    }
    check('invisibility broke on the next auto-attack hit', brokeInvisibility);
  }

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
