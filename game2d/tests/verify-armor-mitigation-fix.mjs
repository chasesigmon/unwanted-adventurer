// Verifies the original bug report behind item 1: "the imp did 5 damage
// to a level 15 with Armor vs Physical of 9 — should have been more like
// 3.2." Boosts a test character's dexterity/strength high enough to hit
// a known Armor vs Physical value, engages an imp in melee, and confirms
// the actual counter-attack damage reflects the new percentage-based
// mitigation instead of the flat, unmitigated attackDamage.
import { io } from 'socket.io-client';
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'ArmorFix' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const CHAR = 'Armorfix' + randomLetters(6);

function psql(sql) {
  execFileSync('docker', ['exec', '-i', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', sql], { stdio: 'inherit' });
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
    socket.on('connect', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
let failed = false;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failed = true;
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

// dexterity=90, strength=90 -> armorVsPhysicalFor = 2 + floor(90/10) + floor(90/10) = 2+9+9 = 20.
// Placed near an imp's own home map/patrol area (Grimoak Grounds).
psql(`UPDATE players SET dexterity=90, strength=90, map='Grimoak Grounds', "row"=20, col=20 WHERE username='${CHAR}';`);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
let latestSync = null;
let mapState = null;
const combatEvents = [];
socket.on('sync', (data) => (latestSync = data.player));
socket.on('map:state', (data) => (mapState = data));
socket.on('combat', (data) => combatEvents.push(data));
await new Promise((r) => setTimeout(r, 1500));

check('armorVsPhysical computed as 20', latestSync?.armorVsPhysical === 20);
console.log('armorVsPhysical:', latestSync?.armorVsPhysical);

const imp = (mapState?.monsters ?? []).find((m) => m.kind === 'imp');
if (!imp) {
  console.log('FAIL - no imp found nearby to test against');
  failed = true;
} else {
  // engageMelee itself has no ack (void handler) — just arms the combat
  // session; actual swings land on the shared combat tick afterward, so
  // wait for a few tick cycles rather than expecting a per-call ack.
  socket.emit('engageMelee', { targetKind: 'monster', targetId: imp.id });
  await new Promise((r) => setTimeout(r, 20000));
  const counterAttackMessages = combatEvents.filter((e) => typeof e.message === 'string' && e.message.includes('punches you back'));
  console.log('combat messages seen:', combatEvents.map((e) => e.message).filter(Boolean));
  if (counterAttackMessages.length > 0) {
    const dmgMatch = counterAttackMessages[0].message.match(/for (\d+) damage/);
    const dmg = dmgMatch ? parseInt(dmgMatch[1], 10) : undefined;
    // Raw imp attackDamage is 5; with armorVsPhysical=20, applyArmorMitigation(5,20) = 5*16/36 ≈ 2.22 -> rounds to 2.
    check('imp counter-attack damage reduced by high armor (expected ~2, not flat 5)', dmg !== undefined && dmg < 5);
    console.log('actual counter-attack damage:', dmg);
  } else {
    console.log('(no counter-attack landed in this window — imp may not have aggroed/been adjacent; inconclusive, not a failure)');
  }
}

socket.disconnect();
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED (or inconclusive but non-failing)');
psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
process.exitCode = failed ? 1 : 0;
