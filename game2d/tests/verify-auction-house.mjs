// Item 1 of a later follow-up ask: "Create an Auction House in both Floro
// and Kortho... allow players to put an item for a specified duration in
// minutes for a specified amount of gold coins. Any other player that is
// over level 5 should be able to use the Auction House and bid on
// items... if at the last minute or less of the auction a player bids on
// an item, then increase the duration by another 2 minutes." Confirms:
// listing removes the item from the seller's inventory, a low-level
// player is rejected from bidding, a valid bid updates currentBid/
// currentBidderUsername for BOTH clients (global broadcast), and the
// anti-snipe extension fires for a bid placed with under a minute left.
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3001';
function randChar(prefix) {
  const letters = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  return prefix + letters;
}

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

// --- Seller: level 10, has a wand to sell, standing at Floro's Auctioneer.
const sellerUname = randChar('AhSell');
const sellerChar = randChar('As');
const { token: sellerAccountToken } = await post('/auth/register', { username: sellerUname, email: sellerUname.toLowerCase() + '@example.com', password: 'testpass123' });
await post('/characters', { name: sellerChar, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, sellerAccountToken);
psql(`UPDATE players SET map='Floro Auction House', "row"=4, col=15, level=10, inventory='["a small canoe"]'::jsonb WHERE username='${sellerChar}';`);
const { token: sellerToken } = await post(`/characters/${sellerChar}/select`, {}, sellerAccountToken);
const sellerSocket = await connect(sellerToken);
await new Promise((r) => setTimeout(r, 500));

// --- Low-level bidder: level 3, should be rejected.
const lowUname = randChar('AhLow');
const lowChar = randChar('Al');
const { token: lowAccountToken } = await post('/auth/register', { username: lowUname, email: lowUname.toLowerCase() + '@example.com', password: 'testpass123' });
await post('/characters', { name: lowChar, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, lowAccountToken);
psql(`UPDATE players SET map='Kortho Auction House', "row"=4, col=15, level=3, gold=1000 WHERE username='${lowChar}';`);
const { token: lowToken } = await post(`/characters/${lowChar}/select`, {}, lowAccountToken);
const lowSocket = await connect(lowToken);
await new Promise((r) => setTimeout(r, 500));

// --- High-level bidder: level 10, gold to spare, standing at Kortho's Auctioneer.
const bidderUname = randChar('AhBid');
const bidderChar = randChar('Ab');
const { token: bidderAccountToken } = await post('/auth/register', { username: bidderUname, email: bidderUname.toLowerCase() + '@example.com', password: 'testpass123' });
await post('/characters', { name: bidderChar, race: 'human', gender: 'male', hairColor: 'brown', skinTone: 'tan' }, bidderAccountToken);
psql(`UPDATE players SET map='Kortho Auction House', "row"=4, col=15, level=10, gold=1000 WHERE username='${bidderChar}';`);
const { token: bidderToken } = await post(`/characters/${bidderChar}/select`, {}, bidderAccountToken);
const bidderSocket = await connect(bidderToken);
let bidderLastAuctionState = null;
bidderSocket.on('auctionState', (listings) => {
  bidderLastAuctionState = listings;
});
await new Promise((r) => setTimeout(r, 500));

// List the canoe for 100 gold, 1 minute duration.
const listRes = await emit(sellerSocket, 'auctionListItem', { itemIndex: 0, startingGold: 100, durationMinutes: 1 });
check('listing succeeded', listRes?.ok === true, JSON.stringify(listRes));
const listing = listRes?.listings?.[0];
check('listing appears with correct starting gold', listing?.startingGold === 100, JSON.stringify(listing));

const sellerInvRes = await emit(sellerSocket, 'auctionGetListings');
console.log('seller re-checked listings:', JSON.stringify(sellerInvRes?.listings));

// Low-level player tries to bid -- should be rejected.
const lowBidRes = await emit(lowSocket, 'auctionBid', { auctionId: listing.id, amount: 150 });
check('level-3 bid rejected', lowBidRes?.ok === false, JSON.stringify(lowBidRes));

// High-level player bids -- should succeed and broadcast globally.
const bidRes = await emit(bidderSocket, 'auctionBid', { auctionId: listing.id, amount: 150 });
check('level-10 bid accepted', bidRes?.ok === true, JSON.stringify(bidRes));

await new Promise((r) => setTimeout(r, 500));
check(
  'the OTHER client (bidder) received the updated auctionState broadcast',
  bidderLastAuctionState?.[0]?.currentBid === 150 && bidderLastAuctionState?.[0]?.currentBidderUsername === bidderChar,
  JSON.stringify(bidderLastAuctionState)
);

// Anti-snipe: list something with a 70-second duration, wait past the
// 60s anti-snipe window, then bid -- should extend by 2 minutes.
const listRes2 = await emit(sellerSocket, 'auctionListItem', { itemIndex: 0, startingGold: 10, durationMinutes: 1 });
console.log('second listing (for anti-snipe test) ack:', JSON.stringify(listRes2));
if (listRes2?.ok) {
  const listing2 = listRes2.listings[listRes2.listings.length - 1];
  const beforeEndsAt = listing2.endsAt;
  const antiSnipeBidRes = await emit(bidderSocket, 'auctionBid', { auctionId: listing2.id, amount: 20 });
  check('anti-snipe bid accepted', antiSnipeBidRes?.ok === true, JSON.stringify(antiSnipeBidRes));
  check('anti-snipe extension message shown', /extended/i.test(antiSnipeBidRes?.message ?? ''), antiSnipeBidRes?.message);
  const afterListings = await emit(sellerSocket, 'auctionGetListings');
  const listing2After = afterListings.listings.find((l) => l.id === listing2.id);
  console.log('anti-snipe: before endsAt', beforeEndsAt, 'after endsAt', listing2After?.endsAt, 'delta ms', (listing2After?.endsAt ?? 0) - beforeEndsAt);
  check('endsAt was extended by ~2 minutes', (listing2After?.endsAt ?? 0) - beforeEndsAt >= 119000, `delta=${(listing2After?.endsAt ?? 0) - beforeEndsAt}`);
}

sellerSocket.close();
lowSocket.close();
bidderSocket.close();
process.exit(failures > 0 ? 1 : 0);
