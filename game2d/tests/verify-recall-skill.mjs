import { io } from 'socket.io-client';

const BASE = 'http://localhost:3001';

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

const { token: accountToken } = await post('/auth/login', { username: process.env.TEST_UNAME, password: 'testpass123' });
console.log('logged in');

const { token: charToken } = await post('/characters/Recalltest/select', {}, accountToken);
console.log('selected character');

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
console.log('before learn -> level:', latestSync?.level, 'skills:', JSON.stringify(latestSync?.skills));

const learnAck = await new Promise((resolve) => socket.emit('learnSkill', { skill: 'recall' }, resolve));
console.log('learnSkill ack:', JSON.stringify(learnAck));

await new Promise((r) => setTimeout(r, 500));
console.log('after learn -> skills:', JSON.stringify(latestSync?.skills));
console.log('recall present in latest sync:', latestSync?.skills?.recall !== undefined);

socket.close();
process.exit(0);
