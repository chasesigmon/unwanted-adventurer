// Item 18: "update the auction house so that if a player's item time
// limit expires, then it should remain in the auction house waiting for
// someone to collect it with 'Expired' labelled on it. The player to
// collect it will either be the highest bidder or the player that
// originally placed the item for auction if no one bid on it."
//
// Two scenarios, both against the live server/DB:
// (A) No bids at all -> listing sits `expired: true` after its 1-minute
//     duration elapses, the ORIGINAL SELLER can collect it back.
// (B) A real winning bid -> after expiry, the WINNING BIDDER (not the
//     seller) is the one who can collect -- paying the bid amount, with
//     the seller getting credited gold once collected.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
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
    socket.once('sync', () => resolve(socket));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
async function makeCharacter(prefix) {
  const CHAR = prefix + randomLetters(8);
  const UNAME = (prefix + randomLetters(8)).slice(0, 16);
  const { token: accountToken } = await post('/auth/register', { username: UNAME, email: `${UNAME}@example.com`.toLowerCase(), password: 'testpass123' });
  await post('/characters', { name: CHAR, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, accountToken);
  psql(`UPDATE players SET map='Floro Auction House', "row"=3, col=15, gold=1000 WHERE username='${CHAR}';`);
  const { token: charToken } = await post(`/characters/${CHAR}/select`, {}, accountToken);
  return { CHAR, UNAME, accountToken, charToken };
}
function cleanup({ CHAR, UNAME }) {
  psql(`DELETE FROM players WHERE username='${CHAR}';`);
  psql(`DELETE FROM accounts WHERE username='${UNAME}';`);
}

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

async function waitForExpiredState(socket, listingId, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const onState = (listings) => {
      const listing = listings.find((l) => l.id === listingId);
      if (listing?.expired) {
        socket.off('auctionState', onState);
        resolve(listing);
      } else if (Date.now() - start > timeoutMs) {
        socket.off('auctionState', onState);
        reject(new Error('timed out waiting for expired: true'));
      }
    };
    socket.on('auctionState', onState);
    // Poll too in case the broadcast interval doesn't line up with our listener attach.
    const poll = setInterval(async () => {
      const res = await new Promise((r) => socket.timeout(5000).emit('auctionGetListings', (err, ack) => r(ack)));
      const listing = res?.listings?.find((l) => l.id === listingId);
      if (listing?.expired) {
        clearInterval(poll);
        socket.off('auctionState', onState);
        resolve(listing);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(poll);
        reject(new Error('timed out polling for expired: true'));
      }
    }, 5000);
  });
}

// --- Scenario A: no bids, seller collects back ---
const sellerA = await makeCharacter('AqA');
psql(`UPDATE players SET inventory = inventory || '["wand"]'::jsonb WHERE username='${sellerA.CHAR}';`);
const socketA = await connect(sellerA.charToken);
const invA = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${sellerA.CHAR}';"`).toString().trim());
const listAck = await new Promise((resolve, reject) =>
  socketA.timeout(5000).emit('auctionListItem', { itemIndex: invA.indexOf('wand'), startingGold: 10, durationMinutes: 1 }, (err, res) => (err ? reject(err) : resolve(res)))
);
check('scenario A: listed successfully', listAck.ok === true, JSON.stringify(listAck));
const listingIdA = listAck.listings.find((l) => l.sellerUsername === sellerA.CHAR)?.id;

console.log('scenario A: waiting for the 1-minute listing to expire (server-side)...');
const expiredA = await waitForExpiredState(socketA, listingIdA, 100_000);
check('scenario A: listing shows expired: true with no bidder', expiredA.expired === true && !expiredA.currentBidderUsername, JSON.stringify(expiredA));

const collectAckA = await new Promise((resolve, reject) =>
  socketA.timeout(5000).emit('collectAuctionItem', listingIdA, (err, res) => (err ? reject(err) : resolve(res)))
);
console.log('scenario A collect ack:', JSON.stringify(collectAckA));
check('scenario A: the original seller can collect their unsold item', collectAckA.ok === true, JSON.stringify(collectAckA));
const invAAfter = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${sellerA.CHAR}';"`).toString().trim());
check('scenario A: the wand is really back in the seller inventory', invAAfter.includes('wand'), JSON.stringify(invAAfter));

socketA.close();
cleanup(sellerA);

// --- Scenario B: a real winning bid, bidder collects, seller gets paid ---
const sellerB = await makeCharacter('AqB');
const bidderB = await makeCharacter('AqC');
// AUCTION_MIN_BID_LEVEL gates bidding to characters above a minimum level.
psql(`UPDATE players SET level=10 WHERE username='${bidderB.CHAR}';`);
psql(`UPDATE players SET inventory = inventory || '["wand"]'::jsonb WHERE username='${sellerB.CHAR}';`);
const socketSellerB = await connect(sellerB.charToken);
const socketBidderB = await connect(bidderB.charToken);
const invB = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${sellerB.CHAR}';"`).toString().trim());
const listAckB = await new Promise((resolve, reject) =>
  socketSellerB.timeout(5000).emit('auctionListItem', { itemIndex: invB.indexOf('wand'), startingGold: 15, durationMinutes: 1 }, (err, res) => (err ? reject(err) : resolve(res)))
);
check('scenario B: listed successfully', listAckB.ok === true, JSON.stringify(listAckB));
const listingIdB = listAckB.listings.find((l) => l.sellerUsername === sellerB.CHAR)?.id;

const bidAck = await new Promise((resolve, reject) =>
  socketBidderB.timeout(5000).emit('auctionBid', { auctionId: listingIdB, amount: 50 }, (err, res) => (err ? reject(err) : resolve(res)))
);
check('scenario B: the bid succeeded', bidAck.ok === true, JSON.stringify(bidAck));

// The bid lands well within AUCTION_ANTI_SNIPE_WINDOW_MS (60s) of a
// 1-minute listing's own endsAt, so it triggers the anti-snipe extension
// (+2 more minutes) -- real, correct, intentional behavior, not a bug;
// the wait just needs to account for it.
console.log('scenario B: waiting for the listing to expire (1min + anti-snipe extension, server-side)...');
const expiredB = await waitForExpiredState(socketBidderB, listingIdB, 220_000);
check('scenario B: listing shows expired: true WITH the winning bidder recorded', expiredB.expired === true && expiredB.currentBidderUsername === bidderB.CHAR, JSON.stringify(expiredB));

// The SELLER should NOT be able to collect -- only the winning bidder can.
const sellerAttempt = await new Promise((resolve, reject) =>
  socketSellerB.timeout(5000).emit('collectAuctionItem', listingIdB, (err, res) => (err ? reject(err) : resolve(res)))
);
check("scenario B: the seller can't collect (bidder is entitled, not them)", sellerAttempt.ok === false, JSON.stringify(sellerAttempt));

const goldBefore = Number(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT gold FROM players WHERE username='${sellerB.CHAR}';"`).toString().trim());
const collectAckB = await new Promise((resolve, reject) =>
  socketBidderB.timeout(5000).emit('collectAuctionItem', listingIdB, (err, res) => (err ? reject(err) : resolve(res)))
);
console.log('scenario B collect ack (bidder):', JSON.stringify(collectAckB));
check('scenario B: the winning bidder can collect', collectAckB.ok === true, JSON.stringify(collectAckB));

const invBidderAfter = JSON.parse(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT inventory FROM players WHERE username='${bidderB.CHAR}';"`).toString().trim());
check('scenario B: the wand is now in the BIDDER inventory (not the seller)', invBidderAfter.includes('wand'), JSON.stringify(invBidderAfter));
await new Promise((r) => setTimeout(r, 500));
const goldAfter = Number(execSync(`docker exec game2d-postgres psql -U game2d -d game2d -t -c "SELECT gold FROM players WHERE username='${sellerB.CHAR}';"`).toString().trim());
check('scenario B: the seller got credited the winning bid amount (50 gold)', goldAfter === goldBefore + 50, `before=${goldBefore} after=${goldAfter}`);

socketSellerB.close();
socketBidderB.close();
cleanup(sellerB);
cleanup(bidderB);

process.exit(failures > 0 ? 1 : 0);
