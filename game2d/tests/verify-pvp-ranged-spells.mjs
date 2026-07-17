// Live verification for items 1, 2, and 6: arcane bolt/stun/disarm should
// (a) work against a PvP-eligible player (not just monsters/training
// dummies) and (b) never say "augue"/"stupefaciunt"/"exarme" in any
// message, and (c) arcane bolt should no longer apply a lingering burn.
// Also covers the wand's own basic ranged auto-attack (the DEFAULT attack
// for anyone with a wand equipped — every character starts with one —
// which right-clicking a player actually uses instead of melee).
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const UNAME_A = 'RangedA' + Math.floor(Math.random() * 1000);
const EMAIL_A = UNAME_A.toLowerCase() + '@example.com';
const CHAR_A = 'Rangeda' + rand2() + rand2();
const UNAME_B = 'RangedB' + Math.floor(Math.random() * 1000);
const EMAIL_B = UNAME_B.toLowerCase() + '@example.com';
const CHAR_B = 'Rangedb' + rand2() + rand2();

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
function noLatin(text) {
  return !/augue|stupefaciunt|exarme|murus lapideus/i.test(text ?? '');
}

let socketA;
let socketB;
try {
  const { token: accountTokenA } = await post('/auth/register', { username: UNAME_A, email: EMAIL_A, password: 'testpass123' });
  await post('/characters', { name: CHAR_A, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenA);
  const { token: accountTokenB } = await post('/auth/register', { username: UNAME_B, email: EMAIL_B, password: 'testpass123' });
  await post('/characters', { name: CHAR_B, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountTokenB);

  psql(
    `UPDATE players SET map='Grimoak Grounds', "row"=63, col=40, level=15, mana=200, max_mana=200, hp=300, max_hp=300, skills='{"arcane bolt": 100, "stun": 100, "disarm": 100}' WHERE username='${CHAR_A}';`
  );
  psql(`UPDATE players SET map='Grimoak Grounds', "row"=63, col=44, level=15, hp=300, max_hp=300 WHERE username='${CHAR_B}';`);

  const { token: tokenA } = await post(`/characters/${CHAR_A}/select`, {}, accountTokenA);
  const { token: tokenB } = await post(`/characters/${CHAR_B}/select`, {}, accountTokenB);
  socketA = await connect(tokenA);
  socketB = await connect(tokenB);
  let latestMapStateA = null;
  socketA.on('map:state', (data) => (latestMapStateA = data));
  await new Promise((r) => setTimeout(r, 700));

  // Arcane bolt against the player.
  const boltAck = await new Promise((resolve) =>
    socketA.emit('castAugue', { targetKind: 'player', targetId: CHAR_B }, resolve)
  );
  console.log('arcane bolt ack:', JSON.stringify(boltAck));
  check('arcane bolt lands on a PvP-eligible player', boltAck.ok === true);
  check('arcane bolt message has no Latin name', noLatin(boltAck.message));
  check('arcane bolt message says "arcane bolt", not "augue"', (boltAck.message ?? '').includes('arcane bolt'));

  // No lingering burn: castAugue's own startAutoAttackAfterSpell also
  // arms a continuing wand-bolt auto-attack (same "keep attacking after a
  // successful spell" behavior every spell here has, unrelated to a
  // burn) — disengage that explicitly first, so any further hp drop can
  // only be a genuine burn tick, not the ordinary auto-attack continuing.
  socketA.emit('disengage');
  await new Promise((r) => setTimeout(r, 500));
  const hpAfterBolt = latestMapStateA?.players?.find((p) => p.username === CHAR_B)?.hp;
  await new Promise((r) => setTimeout(r, 3500));
  const hpLater = latestMapStateA?.players?.find((p) => p.username === CHAR_B)?.hp;
  console.log(`hp right after bolt: ${hpAfterBolt}, hp 3.5s later: ${hpLater}`);
  check('arcane bolt does not apply a lingering burn (hp unchanged afterward)', hpAfterBolt === hpLater);

  // Stun against the player.
  const stunAck = await new Promise((resolve) => socketA.emit('castStupefaciunt', { targetKind: 'player', targetId: CHAR_B }, resolve));
  console.log('stun ack:', JSON.stringify(stunAck));
  check('stun works on a PvP-eligible player', stunAck.ok === true);
  check('stun message has no Latin name', noLatin(stunAck.message));

  // Disarm against the player — give B a weapon first.
  psql(`UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb WHERE username='${CHAR_B}';`);
  await new Promise((r) => setTimeout(r, 300));
  const disarmAck = await new Promise((resolve) => socketA.emit('castExarme', { targetKind: 'player', targetId: CHAR_B }, resolve));
  console.log('disarm ack:', JSON.stringify(disarmAck));
  check('disarm works on a PvP-eligible player', disarmAck.ok === true);
  check('disarm message has no Latin name', noLatin(disarmAck.message));

  // Generic rejection message wording (item 1): try casting on the training
  // dummy's own NPC id won't apply here (npc targets are still valid) —
  // instead confirm an invalid/nonexistent target kind is rejected
  // generically, not with a Latin name.
  const invalidAck = await new Promise((resolve) => socketA.emit('castAugue', { targetKind: 'monster', targetId: 'not-a-real-id' }, resolve));
  check('a stale/invalid target is rejected without a Latin name', noLatin(invalidAck.message));

  // Wand bolt basic ranged auto-attack against the player (item 2's core
  // complaint: right-click's default attack for anyone with a wand).
  const engageAck = await new Promise((resolve) =>
    socketA.emit('engageRangedAttack', { targetKind: 'player', targetId: CHAR_B }, resolve)
  );
  check('engaging the wand-bolt auto-attack on a player is accepted', engageAck.ok === true);
  const hpBeforeAutoAttack = latestMapStateA?.players?.find((p) => p.username === CHAR_B)?.hp;
  await new Promise((r) => setTimeout(r, 3500));
  const hpAfterAutoAttack = latestMapStateA?.players?.find((p) => p.username === CHAR_B)?.hp;
  check('the wand auto-attack actually lands a hit on the player over time', hpAfterAutoAttack < hpBeforeAutoAttack);
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
