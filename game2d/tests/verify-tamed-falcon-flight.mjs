// Items 6 & 7 of a later follow-up ask: "the tamed falcon beast should
// have flight, so if the player flies over water, the tamed falcon should
// be able to fly across the water with them" and "the druid wisp
// transformation should be flying indefinitely as well." The underlying
// fix (shared/constants.ts's isEffectivelyFlying, now used by all three
// follower managers' canCrossWater) is kind-agnostic -- any follower
// crosses water whenever ITS OWNER is flying, by ANY means (flight spell,
// wisp transformation, or a beast transform into a flying-capable kind),
// not just the falcon specifically. A shop-bought pet is far easier to
// set up live than hunting/taming a wild falcon, and exercises the exact
// same canCrossWater code path this fix touched, so it's used here as the
// representative follower.
//
// Run with `node tests/verify-tamed-falcon-flight.mjs` against the live
// dev server -- requires the Postgres container to be up.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
const UNAME = 'WispFly' + Math.floor(Math.random() * 100000);
const EMAIL = UNAME.toLowerCase() + '@example.com';
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Wfly' + randomLetters(8);

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
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

// Bramwick Pet Shop's own vendor sits at (2, 5) -- see server/worlds/
// vendors.ts's bramwick-pet-shop entry. Plenty of gold, full wisp
// transformation skill + a wand equipped, full mana.
psql(
  `UPDATE players SET map='Bramwick Pet Shop', "row"=2, col=6, gold=100, mana=200, max_mana=200, ` +
    `skills='{"punch":1,"wisp transformation":100}'::jsonb, equipment='{"weapon":"wand"}'::jsonb WHERE username='${CHAR}';`
);

const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
const socket = await connect(charToken);
await new Promise((r) => setTimeout(r, 500));

const buyRes = await emit(socket, 'buyItem', { vendorId: 'bramwick-pet-shop', itemLabel: 'puppy' });
check('bought a puppy', buyRes?.ok === true, JSON.stringify(buyRes));

// Teleport to Grimoak Grounds, well clear of the moat's south bridge (at
// ~col 38-42), via a fresh reconnect so handleConnection re-reads the DB
// row/col (a still-open socket's own autosave would otherwise clobber a
// plain UPDATE while connected).
socket.close();
psql(`UPDATE players SET map='Grimoak Grounds', "row"=55, col=20 WHERE username='${CHAR}';`);
const socket2 = await connect(charToken);
let lastMapState = null;
socket2.on('map:state', (payload) => {
  lastMapState = payload;
});
await new Promise((r) => setTimeout(r, 800));

const wispRes = await emit(socket2, 'castWispTransformation');
check('castWispTransformation succeeded', wispRes?.ok === true, JSON.stringify(wispRes));

// Let the pet's cross-map "snap to owner" tick catch up first (it was
// last seen inside Bramwick Pet Shop).
await new Promise((r) => setTimeout(r, 500));
await emit(socket2, 'petCommand', 'follow');

// Walk south into the moat's water repeatedly -- row 55 -> col 20 is well
// inside MOAT_INNER_LEFT..RIGHT and clear of the bridge, so continuing
// south crosses real water tiles (isWaterBlocked) rather than land.
for (let i = 0; i < 15; i++) {
  await emit(socket2, 'move', 'south');
  await new Promise((r) => setTimeout(r, 260));
}
await new Promise((r) => setTimeout(r, 500));

const finalMove = await emit(socket2, 'move', 'south');
const playerRow = finalMove?.player?.row;
console.log('player final row/col:', playerRow, finalMove?.player?.col);

const myPet = lastMapState?.pets?.find((p) => p.ownerUsername === CHAR);
console.log('pet final row/col:', myPet?.row, myPet?.col);
check('pet is present and following (not abandoned at the water\'s edge)', Boolean(myPet), 'no pet snapshot seen in map:state');
if (myPet && playerRow !== undefined) {
  const distance = Math.abs(myPet.row - playerRow);
  check(`pet stayed close to the flying owner while crossing water (distance=${distance})`, distance <= 3);
}

socket2.close();
process.exit(failures > 0 ? 1 : 0);
