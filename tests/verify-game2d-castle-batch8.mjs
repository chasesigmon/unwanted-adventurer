// Live verification for this batch: 'Wizard World' title, lucem's new
// percent-chance success formula (mana always deducted on a cast attempt,
// win or lose; free + always-rolls-growth to turn off), the irrigo podium
// finally getting collision (lucem's already had it — a follow-up ask,
// "podiums" plural, caught the gap), student desk collision, and the
// Entrance Hall fireplaces sitting clear of all 8 north-wall doors.
//
// Requires `npm run dev` running (backend on :3001) and the
// game2d-postgres container up. Run with
// `node tests/verify-game2d-castle-batch8.mjs` from the repo root.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { getMap } from '../game2d/dist/shared/maps.js';
import { fireplacePositionsFor, studentDeskPositionsFor } from '../game2d/dist/shared/lighting.js';
import { isPodiumBlocked, LUCEM_BOOK_POSITION, IRRIGO_BOOK_MAP, IRRIGO_BOOK_POSITION } from '../game2d/dist/shared/spells.js';

const BASE = 'http://localhost:3001';
function randomLetters(n) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}
const PASSWORD = 'testpass123';

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

function sql(query) {
  return execSync(['docker', 'exec', 'game2d-postgres', 'psql', '-U', 'game2d', '-d', 'game2d', '-c', query]
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(' ')).toString().trim();
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.once('sync', (sync) => resolve({ socket, sync }));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('sync timeout')), 5000);
  });
}

function emitWithAck(socket, event, ...args) {
  return new Promise((resolve) => socket.emit(event, ...args, resolve));
}

function move(socket, direction) {
  return new Promise((resolve) => socket.emit('move', direction, resolve));
}

async function main() {
  // === Item 1: 'Wizard World' title ===
  const html = readFileSync(new URL('../game2d/index.html', import.meta.url), 'utf8');
  assert(/<title>Wizard World<\/title>/.test(html), 'the page title is "Wizard World"');
  assert(/<h1>Wizard World<\/h1>/.test(html), 'the login/register heading is "Wizard World"');
  assert(!/Goblin Roam/.test(html), 'the old "Goblin Roam" name is gone from index.html');

  // === Item 4: Entrance Hall fireplaces clear of all 8 north-wall doors ===
  const DOOR_COLS = [5, 11, 17, 23, 29, 35, 41, 47];
  const entranceFireplaces = fireplacePositionsFor('Grimoak Entrance Hall');
  console.log('  entrance hall fireplace positions ->', entranceFireplaces);
  assert(entranceFireplaces.length === 4, 'the Entrance Hall still has 4 fireplaces');
  for (const fp of entranceFireplaces) {
    const minDist = Math.min(...DOOR_COLS.map((c) => Math.abs(c - fp.col)));
    assert(minDist >= 3, `fireplace at col ${fp.col} is at least 3 tiles from every door column (closest: ${minDist})`);
  }

  // === Item 5: irrigo podium collision (lucem's already had it — this is
  // the previously-missing half of "podiums", plural) ===
  assert(isPodiumBlocked(IRRIGO_BOOK_MAP, IRRIGO_BOOK_POSITION.row, IRRIGO_BOOK_POSITION.col), 'isPodiumBlocked flags the irrigo podium tile');
  assert(isPodiumBlocked('Utilization', LUCEM_BOOK_POSITION.row, LUCEM_BOOK_POSITION.col), 'isPodiumBlocked still flags the lucem podium tile too');
  assert(!isPodiumBlocked(IRRIGO_BOOK_MAP, IRRIGO_BOOK_POSITION.row + 2, IRRIGO_BOOK_POSITION.col), 'a tile away from the podium is not blocked');

  // === Item 7: 4 student desks per classroom ===
  const utilizationDesks = studentDeskPositionsFor('Utilization');
  console.log('  Utilization student desks ->', utilizationDesks);
  assert(utilizationDesks.length === 4, 'Utilization classroom has exactly 4 student desks');
  const leftDesks = utilizationDesks.filter((d) => d.col === 4);
  const rightDesks = utilizationDesks.filter((d) => d.col === getMap('Utilization').cols - 5);
  assert(leftDesks.length === 2 && rightDesks.length === 2, '2 desks sit on the left side, 2 on the right');
  assert(studentDeskPositionsFor('Grimoak Entrance Hall').length === 0, 'student desks are classroom-only, not in the Entrance Hall');

  // === Live account/character/socket flow ===
  const email = `goct${randomLetters(6)}@example.com`;
  const acctUsername = `Goct${randomLetters(5)}`;
  const charName = `Gocta${randomLetters(4)}`;
  const reg = await postJson('/auth/register', { email, username: acctUsername, password: PASSWORD });
  await postJson('/characters', { name: charName, gender: 'female', hairColor: 'brown', skinTone: 'tan' }, reg.body.token);
  const select = await postJson(`/characters/${charName}/select`, {}, reg.body.token);
  const { socket, sync } = await connectSocket(select.body.token);
  console.log('  starting inventory ->', sync.player.inventory);

  // === Item 9: right-click canteen drink (client wiring reuses the
  // existing drinkItem server handler — a live sanity check of that
  // handler's own contract, same as batch7 already covers) ===
  const canteenIndex = sync.player.inventory.indexOf('canteen');
  const drinkAck = await emitWithAck(socket, 'drinkItem', canteenIndex);
  console.log('  drink ->', drinkAck);
  assert(drinkAck.ok, 'the drinkItem handler the right-click shortcut calls still works and removes a charge');

  // === Item 5 & 7 live: walking onto the irrigo podium and a student desk
  // in Elemental Casting is blocked ===
  sql(`UPDATE players SET map='Elemental Casting', "row"=${IRRIGO_BOOK_POSITION.row - 1}, col=${IRRIGO_BOOK_POSITION.col}, mana=100, max_mana=100, skills = skills || '{"lucem": 100}'::jsonb WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s2 } = await connectSocket(select.body.token);
  const podiumBlockAck = await move(s2, 'south');
  console.log('  move onto irrigo podium ->', podiumBlockAck.ok, podiumBlockAck.row, podiumBlockAck.col);
  assert(!podiumBlockAck.ok, 'walking onto the Elemental Casting podium tile is blocked');

  const deskPos = studentDeskPositionsFor('Elemental Casting')[0];
  sql(`UPDATE players SET map='Elemental Casting', "row"=${deskPos.row - 1}, col=${deskPos.col} WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s3 } = await connectSocket(select.body.token);
  const deskBlockAck = await move(s3, 'south');
  console.log('  move onto student desk ->', deskBlockAck.ok, deskBlockAck.row, deskBlockAck.col);
  assert(!deskBlockAck.ok, 'walking onto a student desk tile is blocked');
  s3.close();

  // === Item 3: lucem's new success-chance formula ===
  // wandLit lives only in memory (client.data.wandLit, never persisted to
  // the players table) and defaults to false on every fresh connect, so
  // there's no column to reset it through here.
  // With max skill (100), successChance = min(100, 100+10) = 100 -> always
  // succeeds, deterministically testable.
  sql(`UPDATE players SET equipment = equipment || '{"weapon": "wand"}'::jsonb, mana=50, skills = skills || '{"lucem": 100}'::jsonb WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s4 } = await connectSocket(select.body.token);
  const syncOn = new Promise((resolve) => s4.once('sync', resolve));
  s4.emit('chat', '/lucem');
  const { player: afterOn } = await syncOn;
  console.log('  cast lucem at 100% skill -> wandLit:', afterOn.wandLit, 'mana:', afterOn.mana);
  assert(afterOn.wandLit === true, 'with skill 100 (successChance capped at 100), casting always lights the wand');
  assert(afterOn.mana === 40, 'lighting the wand costs exactly 10 mana (50 -> 40)');

  const syncOff = new Promise((resolve) => s4.once('sync', resolve));
  s4.emit('chat', '/lucem');
  const { player: afterOff } = await syncOff;
  console.log('  turn wand off -> wandLit:', afterOff.wandLit, 'mana:', afterOff.mana);
  assert(afterOff.wandLit === false, 'casting again turns the wand back off');
  assert(afterOff.mana === 40, 'turning the wand off costs no mana (still 40)');
  s4.close();

  // Mana is deducted on a cast ATTEMPT regardless of win or lose — proven
  // deterministically by giving exactly enough mana for one attempt at a
  // low (but not zero, since a fresh skill starts at 1) skill percent, so
  // whichever way the roll falls, mana must land at exactly 0 afterward
  // (a second attempt would otherwise be refused for insufficient mana).
  sql(`UPDATE players SET mana=10, max_mana=100, skills = skills || '{"lucem": 1}'::jsonb WHERE username='${charName}';`);
  await sleep(200);
  const { socket: s5 } = await connectSocket(select.body.token);
  const syncLowRoll = new Promise((resolve) => s5.once('sync', resolve));
  s5.emit('chat', '/lucem');
  const { player: afterLowRoll } = await syncLowRoll;
  console.log('  cast lucem at 1% skill with exactly 10 mana -> wandLit:', afterLowRoll.wandLit, 'mana:', afterLowRoll.mana);
  assert(afterLowRoll.mana === 0, 'mana is deducted on a cast attempt whether it succeeds or fumbles (10 -> 0 either way)');
  s5.close();

  s2.close();
  socket.close();
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('ERROR', err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
