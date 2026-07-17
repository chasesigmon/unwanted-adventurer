// Live end-to-end verification for items 11/12/13: a summoner's summoned
// monster, commanded to attack a real wild monster, should land its first
// hit promptly (within a couple seconds of contact) rather than needing
// up to ~3s of already being adjacent before anything registers.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Item1113' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Fixtest' + rand2() + rand2();

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
    `UPDATE players SET level=20, "row"=63, col=40, map='Grimoak Grounds', equipment='{"weapon":"wand"}', skills='{"punch": 100, "monster summons": 100}', specialization='summoner', killed_monster_kinds='["imp"]', mana=200, max_mana=200 WHERE username='${CHAR}';`
  );

  // Animated monsters are removed the instant their owner disconnects (by
  // design — see handleDisconnect), so unlike the pet-based tests earlier
  // this session, this whole scenario needs to happen on ONE connection:
  // find a real imp's position first via a quick throwaway probe
  // connection, THEN start the real one already positioned next to it.
  const { token: probeToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const probeSocket = await connect(probeToken);
  let probeMapState = null;
  probeSocket.on('map:state', (data) => (probeMapState = data));
  await new Promise((r) => setTimeout(r, 800));
  const targetImp = probeMapState?.monsters?.find((m) => m.kind === 'imp' && !m.isRare);
  check('a real wild imp is present to attack', Boolean(targetImp));
  probeSocket.close();
  await new Promise((r) => setTimeout(r, 300));
  if (!targetImp) throw new Error('no imp found, aborting');

  psql(`UPDATE players SET "row"=${targetImp.row}, col=${targetImp.col + 1} WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  const socket = await connect(charToken);
  let latestMapState = null;
  socket.on('map:state', (data) => (latestMapState = data));
  await new Promise((r) => setTimeout(r, 500));

  const summonsAck = await new Promise((resolve) => socket.emit('castMonsterSummons', { monsterKind: 'imp' }, resolve));
  check('monster summons cast succeeded', summonsAck.ok);
  await new Promise((r) => setTimeout(r, 400));

  const summonId = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR)?.id;
  check('summoned monster present in map state', Boolean(summonId));
  if (!summonId) throw new Error('no summon found, aborting');

  const cmdAck = await new Promise((resolve) => socket.emit('animatedMonsterCommand', { id: summonId, command: 'attack' }, resolve));
  console.log('animatedMonsterCommand ack:', JSON.stringify(cmdAck));

  const attackAck = await new Promise((resolve) =>
    socket.emit('commandFollowerAttack', { targetKind: 'monster', targetId: targetImp.id }, resolve)
  );
  console.log('commandFollowerAttack ack:', JSON.stringify(attackAck));

  // Poll every 300ms for up to 3s (well under the OLD worst case of
  // needing to wait for a shared 3s tick to even NOTICE contact, let
  // alone resolve a hit) watching the real imp's hp for a drop.
  const startHp = targetImp.hp;
  let hitDetected = false;
  const notices = [];
  socket.on('combatNotice', (m) => notices.push(m));
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const current = latestMapState?.monsters?.find((m) => m.id === targetImp.id);
    if (!current || current.hp < startHp) {
      hitDetected = true;
      console.log(`Hit detected after ~${(i + 1) * 300}ms (imp hp ${startHp} -> ${current?.hp ?? 'dead/gone'})`);
      break;
    }
  }
  check('summoned monster landed a hit on the real imp within 3s of commanding attack+contact', hitDetected);
  console.log('combatNotices seen:', notices);

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
