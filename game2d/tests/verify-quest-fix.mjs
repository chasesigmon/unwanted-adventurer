import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';
const UNAME = 'QuestFixTest' + Math.floor(Math.random() * 10000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const CHAR = 'Qftchar' + ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];

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

const { token: accountToken } = await post('/auth/register', { username: UNAME, email: EMAIL, password: 'testpass123' });
console.log('registered account', UNAME);

await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
console.log('created character', CHAR);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = io(BASE, { auth: { token: charToken }, transports: ['websocket'] });
socket.on('connect_error', (err) => console.error('connect_error', err.message));

await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  setTimeout(() => reject(new Error('connect timeout')), 5000);
});
console.log('socket connected');

let latestSync = null;
socket.on('sync', (data) => {
  latestSync = data.player;
});
await new Promise((r) => setTimeout(r, 500));

// Simulate "already satisfied the objective before accepting the quest":
// choose a house FIRST, then start the choose-house quest afterward.
const houseAck = await new Promise((resolve) => socket.emit('chooseHouse', { house: 'Emberclaw' }, resolve));
console.log('chooseHouse ack:', JSON.stringify(houseAck));

const startAck = await new Promise((resolve) => socket.emit('startQuest', { questId: 'choose-house' }, resolve));
console.log('startQuest(choose-house) ack:', JSON.stringify(startAck));

await new Promise((r) => setTimeout(r, 300));
console.log('quests after start:', JSON.stringify(latestSync?.quests));

// The actual bug fix under test is client-side (re-render the dialogue
// after start instead of just clearing the button) — but we can still
// confirm the SERVER considers the quest immediately completable, which
// is the load-bearing half of the fix.
const completeAck = await new Promise((resolve) => socket.emit('completeQuest', { questId: 'choose-house' }, resolve));
console.log('completeQuest(choose-house) ack (should be ok:true, immediately, no further action needed):', JSON.stringify(completeAck));

if (completeAck.ok) {
  console.log('PASS: quest completed immediately after starting, since the house was already chosen beforehand.');
} else {
  console.log('FAIL: expected immediate completion.');
}

socket.disconnect();
process.exit(completeAck.ok ? 0 : 1);
