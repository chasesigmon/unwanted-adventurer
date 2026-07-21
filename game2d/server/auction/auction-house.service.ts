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

  // Called on a periodic tick — returns every listing whose time is up,
  // removing them from the active map. The caller (GameGateway) resolves
  // the actual gold/item transfer, since that needs access to connected
  // sockets and the players DB, neither of which this service knows about.
  takeExpired(): AuctionListingSnapshot[] {
    const now = Date.now();
    const expired: AuctionListingSnapshot[] = [];
    for (const [id, listing] of this.listings) {
      if (listing.endsAt <= now) {
        expired.push(listing);
        this.listings.delete(id);
      }
    }
    return expired;
  }
}
