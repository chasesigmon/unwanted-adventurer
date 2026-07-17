import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'RegrTest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Regrtest' + rand2() + rand2();

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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered', UNAME);
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
psql(`UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6 WHERE username='${CHAR}';`);

let { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
let socket = await connect(charToken);
let latestMapState = null;
const notices = [];
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => { notices.push(msg); console.log('[combatNotice]', msg); });
await new Promise((r) => setTimeout(r, 500));

const buyAck = await new Promise((resolve) => socket.emit('buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'kitten' }, resolve));
console.log('bought pet:', JSON.stringify(buyAck));

socket.disconnect();
await new Promise((r) => setTimeout(r, 300));
psql(`UPDATE players SET map='Grimoak Grounds', "row"=40, col=40 WHERE username='${CHAR}';`);
({ token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken));
socket = await connect(charToken);
socket.on('map:state', (data) => (latestMapState = data));
socket.on('combatNotice', (msg) => { notices.push(msg); console.log('[combatNotice]', msg); });
console.log('reconnected at Grimoak Grounds');
await new Promise((r) => setTimeout(r, 1000));

const imp = latestMapState?.monsters?.find((m) => m.kind === 'imp');
if (!imp) {
  console.log('FAIL: no imp found');
  process.exit(1);
}
console.log('targeting imp', imp.id, 'at', imp.row, imp.col);
const attackAck = await new Promise((resolve) => socket.emit('commandFollowerAttack', { targetKind: 'monster', targetId: imp.id }, resolve));
console.log('commandFollowerAttack ack:', JSON.stringify(attackAck));

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const pet = latestMapState?.pets?.find((p) => p.ownerUsername === CHAR);
  console.log(`tick ${i}: pet at (${pet?.row},${pet?.col}) command=${pet?.command} target=${pet?.attackTargetId} notices=${notices.length}`);
  if (notices.some((m) => m.includes('strikes the') || m.includes('finishes off'))) break;
}

const dealtDamage = notices.some((m) => m.includes('strikes the') || m.includes('finishes off'));
console.log(dealtDamage ? 'PASS: pet dealt damage via z command' : 'FAIL: pet never dealt damage');
socket.disconnect();
process.exit(dealtDamage ? 0 : 1);
