// A later follow-up ask: "Create an Auction House in both Floro and
// Kortho. It should allow players to put an item for a specified duration
// in minutes for a specified amount of gold coins. Any other player that
// is over level 5 should be able to use the Auction House and bid on
// items... if at the last minute or less of the auction a player bids on
// an item, then increase the duration by another 2 minutes." A single
// shared, GLOBAL listing pool (not per-map) — the two towns' Auctioneers
// are just two access points into the same marketplace, the same way a
// real auction house works, rather than two isolated economies.
export const AUCTION_MIN_BID_LEVEL = 5;
export const AUCTION_ANTI_SNIPE_WINDOW_MS = 60_000;
export const AUCTION_ANTI_SNIPE_EXTENSION_MS = 2 * 60_000;
export const AUCTION_MIN_DURATION_MINUTES = 1;
// A sane upper bound (a week) — nothing in the ask requires one, but an
// unbounded duration invites a mistyped listing nobody can ever cancel.
export const AUCTION_MAX_DURATION_MINUTES = 7 * 24 * 60;
