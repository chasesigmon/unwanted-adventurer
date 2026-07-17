// Investigation-only script (not a pass/fail test) for item 11: "the
// summoner's summon is still not auto-attacking the enemy when it gets
// close, but the animated dead are attacking." Casts monster summons and
// inspects the resulting AnimatedMonsterSnapshot fields directly to spot
// any difference vs. what animate dead would produce.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'Item11Inv' + Math.floor(Math.random() * 1000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const rand2 = () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
const CHAR = 'Invtest' + rand2() + rand2();

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
await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);

psql(
  `UPDATE players SET level=20, "row"=63, col=40, map='Grimoak Grounds', equipment='{"weapon":"wand"}', skills='{"punch": 100, "monster summons": 100}', specialization='summoner', killed_monster_kinds='["imp"]', mana=200, max_mana=200 WHERE username='${CHAR}';`
);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);

let latestMapState = null;
socket.on('map:state', (data) => (latestMapState = data));
await new Promise((r) => setTimeout(r, 800));

const summonsAck = await new Promise((resolve) => socket.emit('castMonsterSummons', { monsterKind: 'imp' }, resolve));
console.log('castMonsterSummons ack:', JSON.stringify(summonsAck));
await new Promise((r) => setTimeout(r, 500));

const mySummon = latestMapState?.animatedMonsters?.find((m) => m.ownerUsername === CHAR);
console.log('Resulting AnimatedMonsterSnapshot:', JSON.stringify(mySummon, null, 2));

socket.close();
psql(`DELETE FROM players WHERE username='${CHAR}'; DELETE FROM accounts WHERE username='${UNAME}';`);
