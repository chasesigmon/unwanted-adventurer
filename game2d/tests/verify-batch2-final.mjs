// Live smoke test for the riskiest server-side changes in the 22-item
// follow-up batch: item 11 (arcane bolt costs 7 mana, split from the
// shared SPELL_ATTACK_MANA_COST), item 21 (escalating hemomancer BP
// overdraft penalty), item 20 (rare imp is level 3 with rescaled stats).
// Cleans up its own test account/character afterward.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'B2FinTest' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Bftest' + rand2() + rand2();

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

  // Level 20, wand equipped, arcane bolt + sap health both maxed out (100%
  // so rollSpellSuccess always succeeds), placed on Grimoak Grounds where
  // both an ordinary imp AND the level-3 rare imp roam, plenty of mana,
  // and bp already deep negative (-25) to exercise item 21's escalating
  // overdraft math (floor(25/10)=2 -> penalty 5*(1+2)=15 on the very next
  // sap health cast).
  psql(
    `UPDATE players SET level=20, "row"=63, col=40, map='Grimoak Grounds', equipment='{"weapon":"wand"}', skills='{"arcane bolt": 100, "sap health": 100, "punch": 100}', specialization='hemomancer', bp=-25, mana=200, max_mana=200, hp=500, max_hp=500 WHERE username='${CHAR}';`
  );

  let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  let socket = await connect(charToken);

  let latestMapState = null;
  let latestPlayer = null;
  socket.on('map:state', (data) => (latestMapState = data));
  socket.on('sync', (data) => {
    if (data.player) latestPlayer = data.player;
  });
  await new Promise((r) => setTimeout(r, 1200));

  // --- Item 20: rare imp is level 3 with rescaled stats ---
  const rareImp = latestMapState?.monsters?.find((m) => m.kind === 'imp' && m.isRare);
  check('rare imp is present on Grimoak Grounds', Boolean(rareImp));
  if (rareImp) {
    check(`rare imp level is 3 (got ${rareImp.level})`, rareImp.level === 3);
    check(`rare imp hp is 105 (got ${rareImp.maxHp})`, rareImp.maxHp === 105);
  }

  // --- Item 11: arcane bolt (augue) costs 7 mana, not the shared 10 ---
  const ordinaryImp = latestMapState?.monsters?.find((m) => m.kind === 'imp' && !m.isRare);
  check('an ordinary imp is present to test augue on', Boolean(ordinaryImp));
  if (ordinaryImp) {
    // Teleport right next to it (both spells' own range is generous, 7
    // tiles, but the spawn tile can be arbitrarily far from wherever this
    // particular imp happened to roam) — reconnect afterward since a
    // position change needs a fresh session snapshot.
    socket.close();
    psql(`UPDATE players SET "row"=${ordinaryImp.row}, col=${ordinaryImp.col + 1} WHERE username='${CHAR}';`);
    ({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
    socket = await connect(charToken);
    socket.on('map:state', (data) => (latestMapState = data));
    socket.on('sync', (data) => {
      if (data.player) latestPlayer = data.player;
    });
    await new Promise((r) => setTimeout(r, 800));

    const manaBefore = latestPlayer?.mana ?? 0;
    const augueAck = await new Promise((resolve) => socket.emit('castAugue', { targetKind: 'monster', targetId: ordinaryImp.id }, resolve));
    console.log('augue ack:', JSON.stringify(augueAck));
    await new Promise((r) => setTimeout(r, 200));
    const manaAfter = latestPlayer?.mana ?? manaBefore;
    check(`augue deducted exactly 7 mana (before=${manaBefore}, after=${manaAfter})`, augueAck.ok && manaBefore - manaAfter === 7);
  }

  // --- Item 21: escalating hemomancer bp overdraft penalty ---
  // bp starts at -25 -> overdraftDepth = floor(25/10) = 2 -> penalty =
  // 5*(1+2) = 15 hp on this cast (on top of sap health's own +10 self-heal
  // from a successful hit, so net should be -15+10 = -5 hp if it hits, or
  // just -15 if it fumbles -- either way hp should drop by at least 15
  // relative to a no-penalty baseline). We disable the heal-back
  // confounder by checking the exact combatNotice/message text instead,
  // which states the overdraft cost directly.
  if (ordinaryImp) {
    const hpBefore = latestPlayer?.hp ?? 0;
    let overdraftNoticeMessage = null;
    const onNotice = (msg) => {
      if (msg.includes('overdraft')) overdraftNoticeMessage = msg;
    };
    socket.on('combatNotice', onNotice);
    const sapAck = await new Promise((resolve) => socket.emit('castSapHealth', { targetKind: 'monster', targetId: ordinaryImp.id }, resolve));
    console.log('sap health ack:', JSON.stringify(sapAck));
    await new Promise((r) => setTimeout(r, 200));
    socket.off('combatNotice', onNotice);
    const message = sapAck.message ?? overdraftNoticeMessage ?? '';
    check(`sap health ack mentions the escalated 15 hp overdraft (message: "${message}")`, message.includes('15 hp'));
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
