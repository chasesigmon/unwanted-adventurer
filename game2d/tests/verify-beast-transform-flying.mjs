// Smoke test for the follow-up ask: druid Transform into a flying beast
// (falcon) should actually fly (cross water, correct message/affects),
// only physical-attack while transformed (magic spells blocked), and move
// faster (haste-equivalent). Run with
// `node tests/verify-beast-transform-flying.mjs` against the live dev
// server — requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'FlyTr' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Flychartest' + ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'pipe' });
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

function emit(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, (res) => resolve(res)));
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
// Grimoak Grounds has a moat (real water) right by the castle door
// (CASTLE_DOOR_ON_GROUNDS row 55, col 40; the south band of water spans
// rows 59-61) — put the player just north of it on dry land, equip a
// wand, learn the needed spells, and seed a tamed falcon into their
// history.
psql(
  `UPDATE players SET map='Grimoak Grounds', "row"=58, col=40, mv=100, max_mv=100, level=15, specialization='druid', mana=500, max_mana=500, ` +
    `skills='{\\"punch\\":100,\\"tame beast\\":100,\\"transform\\":100,\\"stun\\":100}', equipment='{\\"weapon\\":\\"wand\\"}', tamed_beast_kinds='[\\"falcon\\"]' ` +
    `WHERE username='${CHAR}';`
);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 400));

let sawTransformedSnapshot = false;
socket.on('sync', (payload) => {
  if (payload.player?.beastTransformActive && payload.player.beastTransformKind === 'falcon') sawTransformedSnapshot = true;
});

const transform = await emit(socket, 'castTransform', { kind: 'falcon' });
check('castTransform into falcon ok', transform.ok === true, transform.message);
check('transform message mentions flying', /flying|air/i.test(transform.message ?? ''), transform.message);
await new Promise((r) => setTimeout(r, 400));
check('own sync snapshot reflects beastTransformActive=true, kind=falcon', sawTransformedSnapshot);

const stunWhileTransformed = await emit(socket, 'castStupefaciunt', { targetKind: 'monster', targetId: 'nonexistent' });
check(
  'magic spell (stun) blocked while transformed',
  stunWhileTransformed.ok === false && /transformed/.test(stunWhileTransformed.message ?? ''),
  stunWhileTransformed.message
);

const rangedWhileTransformed = await emit(socket, 'engageRangedAttack', { targetKind: 'monster', targetId: 'nonexistent' });
check('ranged wand attack still blocked while transformed', rangedWhileTransformed.ok === false && /transformed/.test(rangedWhileTransformed.message ?? ''));

// Move south into the moat's water — should succeed only because flying
// (falcon) bypasses the water-crossing gate.
const waterMove = await emit(socket, 'move', 'south');
check('flying beast-transform can cross water', waterMove.ok === true, waterMove.message);

// Casting transform again should revert back to normal.
const revert = await emit(socket, 'castTransform', { kind: 'falcon' });
check('casting transform again reverts to normal form', revert.ok === true && /normal form/i.test(revert.message ?? ''), revert.message);

process.exit(failures > 0 ? 1 : 0);
