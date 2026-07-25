import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { AuctionListingSnapshot } from '../../shared/types.js';
import { AUCTION_ANTI_SNIPE_WINDOW_MS, AUCTION_ANTI_SNIPE_EXTENSION_MS } from '../../shared/auctionHouse.js';

// A later follow-up ask: "Create an Auction House in both Floro and
// Kortho." Plain in-memory, not persisted — same tradeoff every other
// world-content manager here (monsters, corpses, dropped-item chests)
// already makes; a listed item is held the same way a dropped-item
// chest's contents are (see DroppedItemManagerService), and a bidder's
// gold is never deducted until the auction actually resolves (no escrow)
// — see GameGateway's own resolveAuction, which re-validates the winning
// bidder still has the gold at that point. A mid-auction server restart
// can therefore only ever lose the LISTED ITEM (the same risk a corpse/
// chest already carries), never a bidder's own persisted gold balance.
@Injectable()
export class AuctionHouseService {
  private listings = new Map<string, AuctionListingSnapshot>();

  list(sellerUsername: string, itemLabel: string, startingGold: number, durationMinutes: number): AuctionListingSnapshot {
    const listing: AuctionListingSnapshot = {
      id: randomUUID(),
      sellerUsername,
      itemLabel,
      startingGold,
      currentBid: startingGold,
      currentBidderUsername: undefined,
      endsAt: Date.now() + durationMinutes * 60_000,
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  getAll(): AuctionListingSnapshot[] {
    return Array.from(this.listings.values()).map((l) => ({ ...l }));
  }

  // Item 29: GameGateway needs to check the requester's inventory capacity
  // BEFORE calling collectItem below, since collectItem deletes the
  // listing immediately on success — checking capacity only after would
  // mean a rejected-for-being-full collect attempt has already destroyed
  // the listing, losing the item for good. A read-only peek, no mutation.
  peek(id: string): AuctionListingSnapshot | undefined {
    return this.listings.get(id);
  }

  // Places a bid, applying the anti-snipe extension ("if at the last
  // minute or less of the auction a player bids... increase the duration
  // by another 2 minutes") in the same step. Returns the previous
  // bidder's username (if any) so the caller can notify them they've been
  // outbid — nothing to refund, since gold is never deducted until
  // resolution.
  bid(id: string, bidderUsername: string, amount: number): { ok: true; previousBidder?: string; extended: boolean } | { ok: false; message: string } {
    const listing = this.listings.get(id);
    if (!listing) return { ok: false, message: 'That auction is no longer active.' };
    if (listing.sellerUsername === bidderUsername) return { ok: false, message: "You can't bid on your own listing." };
    const minBid = listing.currentBidderUsername ? listing.currentBid + 1 : listing.currentBid;
    if (amount < minBid) return { ok: false, message: `You must bid at least ${minBid} gold.` };

    const previousBidder = listing.currentBidderUsername;
    listing.currentBid = amount;
    listing.currentBidderUsername = bidderUsername;

    let extended = false;
    if (listing.endsAt - Date.now() <= AUCTION_ANTI_SNIPE_WINDOW_MS) {
      listing.endsAt += AUCTION_ANTI_SNIPE_EXTENSION_MS;
      extended = true;
    }
    return { ok: true, previousBidder, extended };
  }

  // Called on a periodic tick — flips every listing whose time is up to
  // `expired: true` and returns the ones that JUST crossed that line (so
  // the caller only sends a one-time "your auction expired" notice, not
  // one every tick forever). A later follow-up ask ("it should remain in
  // the auction house waiting for someone to collect it") means expiry no
  // longer removes the listing itself — see collectItem below for the
  // actual gold/item transfer, which only now happens on request.
  takeExpired(): AuctionListingSnapshot[] {
    const now = Date.now();
    const justExpired: AuctionListingSnapshot[] = [];
    for (const listing of this.listings.values()) {
      if (!listing.expired && listing.endsAt <= now) {
        listing.expired = true;
        justExpired.push(listing);
      }
    }
    return justExpired;
  }

  // A later follow-up ask: "the player to collect it will either be the
  // highest bidder or the player that originally placed the item for
  // auction if no one bid on it" — removes the listing only once whoever's
  // actually entitled to it claims it; the caller (GameGateway) still owns
  // the real gold/item transfer, same division of labor takeExpired above
  // already has.
  collectItem(id: string, requesterUsername: string): { ok: true; listing: AuctionListingSnapshot } | { ok: false; message: string } {
    const listing = this.listings.get(id);
    if (!listing) return { ok: false, message: 'That listing no longer exists.' };
    if (!listing.expired) return { ok: false, message: "That auction hasn't ended yet." };
    const entitled = listing.currentBidderUsername ?? listing.sellerUsername;
    if (requesterUsername !== entitled) {
      return { ok: false, message: "You aren't the one who can collect this." };
    }
    this.listings.delete(id);
    return { ok: true, listing };
  }
}
