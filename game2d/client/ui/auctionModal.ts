// The Auction House modal (a later follow-up ask: "Create an Auction
// House in both Floro and Kortho... make sure the duration on the auction
// house modal is updated immediately with each change"). A single shared,
// global listing pool (see shared/auctionHouse.ts's own doc comment) — the
// SAME listings render no matter which town's Auctioneer opened this.
//
// The live countdown is computed CLIENT-SIDE from each listing's own
// endsAt timestamp, refreshed once a second by a plain interval that runs
// for the lifetime of the page (a no-op whenever the modal happens to be
// closed) — this is what keeps the remaining time visibly ticking down
// between server broadcasts, and what makes an anti-snipe extension (the
// server pushing a NEW endsAt) show up immediately rather than waiting
// for the next second-tick to happen to recompute it.
import { myProfile, network, setMyProfile } from '../state.js';
import type { AuctionListingSnapshot } from '../../shared/types.js';
import { AUCTION_MIN_BID_LEVEL } from '../../shared/auctionHouse.js';
import { groupInventoryItems } from '../../shared/items.js';
import { logCombatMessage } from './log.js';
import { auctionGoldLine, auctionListingList, auctionListItemForm, auctionModal, closeAllModals, registerModalRefreshHandler, updateInputCaptured } from './modalCore.js';
import { updateStatusBar } from './statusBar.js';
import { attachTooltip } from './tooltip.js';
import { itemTooltip } from './skillMeta.js';

let listings: AuctionListingSnapshot[] = [];

function formatRemaining(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now());
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function renderAuctionModal(): void {
  auctionGoldLine.textContent = `Your gold: ${myProfile?.gold ?? 0}`;
  auctionListingList.innerHTML = '';

  if (listings.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No active listings right now.';
    auctionListingList.appendChild(li);
  }

  for (const listing of listings) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    li.dataset.auctionId = listing.id;

    const label = document.createElement('span');
    const bidText = listing.currentBidderUsername ? `current bid ${listing.currentBid} gold (${listing.currentBidderUsername})` : `starting bid ${listing.startingGold} gold`;
    label.textContent = `${listing.itemLabel} — ${bidText} — ${formatRemaining(listing.endsAt)} left`;
    label.className = 'auction-listing-label';
    attachTooltip(label, () => itemTooltip(listing.itemLabel));
    li.appendChild(label);

    const isOwnListing = listing.sellerUsername === myProfile?.username;
    const canBid = !isOwnListing && (myProfile?.level ?? 0) > AUCTION_MIN_BID_LEVEL;
    if (canBid) {
      const bidInput = document.createElement('input');
      bidInput.type = 'number';
      bidInput.min = String(listing.currentBidderUsername ? listing.currentBid + 1 : listing.currentBid);
      bidInput.placeholder = String(listing.currentBidderUsername ? listing.currentBid + 1 : listing.currentBid);
      bidInput.className = 'shop-bank-amount';
      const bidBtn = document.createElement('button');
      bidBtn.type = 'button';
      bidBtn.textContent = 'Bid';
      bidBtn.addEventListener('click', () => placeBid(listing.id, bidInput.value));
      li.appendChild(bidInput);
      li.appendChild(bidBtn);
    } else if (isOwnListing) {
      const ownLabel = document.createElement('span');
      ownLabel.textContent = '(your listing)';
      li.appendChild(ownLabel);
    } else {
      const gatedLabel = document.createElement('span');
      gatedLabel.textContent = `(level ${AUCTION_MIN_BID_LEVEL + 1}+ to bid)`;
      li.appendChild(gatedLabel);
    }

    auctionListingList.appendChild(li);
  }

  renderListItemForm();
}

// Re-renders JUST the countdown text every second, without rebuilding the
// whole list (which would drop input focus/typed bid amounts) — the
// listing DATA only changes via the 'auctionState' broadcast/refresh
// below, not this tick.
function tickCountdowns(): void {
  if (auctionModal.hidden) return;
  for (const listing of listings) {
    const li = auctionListingList.querySelector<HTMLLIElement>(`li[data-auction-id="${listing.id}"]`);
    const label = li?.querySelector<HTMLSpanElement>('.auction-listing-label');
    if (!label) continue;
    const bidText = listing.currentBidderUsername ? `current bid ${listing.currentBid} gold (${listing.currentBidderUsername})` : `starting bid ${listing.startingGold} gold`;
    label.textContent = `${listing.itemLabel} — ${bidText} — ${formatRemaining(listing.endsAt)} left`;
  }
}
setInterval(tickCountdowns, 1000);

function renderListItemForm(): void {
  auctionListItemForm.innerHTML = '';
  if (!myProfile || myProfile.inventory.length === 0) {
    const li = document.createElement('li');
    li.textContent = "You don't have anything to list.";
    auctionListItemForm.appendChild(li);
    return;
  }

  // Item 7: alphabetized, same fix as the Inventory/shop modals (see
  // groupInventoryItems's own doc comment).
  const groups = groupInventoryItems(myProfile.inventory);

  for (const [item, indices] of groups) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    const label = document.createElement('span');
    label.textContent = indices.length > 1 ? `${item} x${indices.length}` : item;
    attachTooltip(label, () => itemTooltip(item));

    const goldInput = document.createElement('input');
    goldInput.type = 'number';
    goldInput.min = '1';
    goldInput.placeholder = 'Starting gold';
    goldInput.className = 'shop-bank-amount';

    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '1';
    durationInput.placeholder = 'Minutes';
    durationInput.className = 'shop-bank-amount';

    const listBtn = document.createElement('button');
    listBtn.type = 'button';
    listBtn.textContent = 'List';
    listBtn.addEventListener('click', () => listItem(indices[0]!, goldInput.value, durationInput.value));

    li.appendChild(label);
    li.appendChild(goldInput);
    li.appendChild(durationInput);
    li.appendChild(listBtn);
    auctionListItemForm.appendChild(li);
  }
}

function parsedPositiveInt(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function listItem(itemIndex: number, rawGold: string, rawMinutes: string): void {
  const startingGold = parsedPositiveInt(rawGold);
  const durationMinutes = parsedPositiveInt(rawMinutes);
  if (startingGold === undefined || durationMinutes === undefined) {
    logCombatMessage('Enter a valid starting gold amount and duration first.');
    return;
  }
  network
    .auctionListItem(itemIndex, startingGold, durationMinutes)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (ack.listings) listings = ack.listings;
      if (myProfile) {
        // The item just left the player's own inventory — mirrors every
        // other "server confirmed, now drop it locally too" ack shape
        // (buyItem/sellItem) rather than waiting for the next 'sync'.
        setMyProfile({ ...myProfile, inventory: myProfile.inventory.filter((_, i) => i !== itemIndex) });
        updateStatusBar();
      }
      logCombatMessage('Listed your item on the Auction House.');
      renderAuctionModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

function placeBid(auctionId: string, rawAmount: string): void {
  const amount = parsedPositiveInt(rawAmount);
  if (amount === undefined) {
    logCombatMessage('Enter a valid bid amount first.');
    return;
  }
  network
    .auctionBid(auctionId, amount)
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
      // The actual listings update arrives via the 'auctionState'
      // broadcast (see registerAuctionStateListener below), which every
      // OTHER open client also receives — no need to duplicate that
      // here on success.
    })
    .catch(() => {
      /* nothing to show */
    });
}

export function openAuctionModal(): void {
  closeAllModals();
  auctionModal.hidden = false;
  updateInputCaptured();
  network
    .auctionGetListings()
    .then((res) => {
      listings = res.listings;
      renderAuctionModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

// Keeps the modal live while it's open on ANY client (a bid or a fresh
// listing from someone else, or this listing's own anti-snipe extension)
// — see this module's own doc comment on why the countdown itself is a
// separate, more frequent local tick instead of waiting for this.
export function registerAuctionStateListener(target: EventTarget): void {
  target.addEventListener('auctionState', ((e: CustomEvent<AuctionListingSnapshot[]>) => {
    listings = e.detail;
    if (!auctionModal.hidden) renderAuctionModal();
  }) as EventListener);
}

registerModalRefreshHandler(auctionModal, renderAuctionModal);
