// The shop modal — a vendor's fixed item list, each with a Buy button.
// Vendors never move or restock, so there's nothing to poll; every
// purchase just re-renders against the same static item list. Item 17's
// Bank and item 30's Inn are special-cased below (a services list rather
// than a buy/sell list) since neither sells or buys ordinary items.
import { myProfile, network, setMyProfile } from '../state.js';
import type { VendorSnapshot } from '../../shared/types.js';
import { logCombatMessage } from './log.js';
import { closeAllModals, refreshOpenModals, registerModalRefreshHandler, shopGoldLine, shopGreeting, shopItemList, shopModal, shopModalTitle, updateInputCaptured } from './modalCore.js';
import { updateStatusBar } from './statusBar.js';
import { attachTooltip } from './tooltip.js';
import { itemTooltip } from './skillMeta.js';
import { playRestCutscene } from './restCutscene.js';

let currentVendor: VendorSnapshot | null = null;

const BANK_VENDOR_IDS = ['kortho-bank', 'floro-bank'];
const INN_VENDOR_IDS = ['kortho-inn', 'floro-inn'];

export function renderShopModal(): void {
  shopGoldLine.textContent = `Your gold: ${myProfile?.gold ?? 0}`;
  shopItemList.innerHTML = '';
  if (!currentVendor) return;

  if (BANK_VENDOR_IDS.includes(currentVendor.id)) {
    renderBankSection();
    return;
  }
  if (INN_VENDOR_IDS.includes(currentVendor.id)) {
    renderInnSection();
    return;
  }

  // Item 19: "make a clear separation between items that can be bought
  // and items that can be sold" — a header above each list, not just the
  // "Your items" divider that already separated them visually.
  if (currentVendor.items.length > 0) {
    const forSaleHeader = document.createElement('li');
    forSaleHeader.className = 'shop-item-divider';
    forSaleHeader.textContent = 'For sale';
    shopItemList.appendChild(forSaleHeader);
  }
  for (const item of currentVendor.items) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    const label = document.createElement('span');
    label.textContent = `${item.label} — ${item.price} gold`;
    // Item 32: the same hover description the Inventory modal already
    // shows, surfaced here too.
    attachTooltip(label, () => itemTooltip(item.label));
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = 'Buy';
    buyBtn.addEventListener('click', () => buyVendorItem(item.label));
    li.appendChild(label);
    li.appendChild(buyBtn);
    shopItemList.appendChild(li);
  }

  // A later follow-up ask: "sell to vendor" — every vendor buys back
  // anything the player is carrying (see vendors.ts's own sellValueFor),
  // shown as a second list right below what the shop itself sells. Item
  // 19: stacked into "item x3" rows same as the Inventory modal, rather
  // than one row per copy — clicking a stack sells only the first index
  // sharing that name, i.e. exactly one at a time.
  if (myProfile && myProfile.inventory.length > 0) {
    const divider = document.createElement('li');
    divider.className = 'shop-item-divider';
    divider.textContent = 'Your items';
    shopItemList.appendChild(divider);

    const groups = new Map<string, number[]>();
    myProfile.inventory.forEach((item, index) => {
      const indices = groups.get(item);
      if (indices) indices.push(index);
      else groups.set(item, [index]);
    });

    for (const [item, indices] of groups) {
      const li = document.createElement('li');
      li.className = 'shop-item';
      const label = document.createElement('span');
      label.textContent = indices.length > 1 ? `${item} x${indices.length}` : item;
      attachTooltip(label, () => itemTooltip(item));
      const sellBtn = document.createElement('button');
      sellBtn.type = 'button';
      sellBtn.textContent = 'Sell';
      sellBtn.addEventListener('click', () => sellVendorItem(indices[0]!));
      li.appendChild(label);
      li.appendChild(sellBtn);
      shopItemList.appendChild(li);
    }
  }
}

// Item 17's Bank — deposit is free, withdrawal costs a flat 5% fee (see
// game.gateway.ts's BANK_WITHDRAWAL_FEE_PERCENT). A single balance shared
// between Kortho's and Floro's own Bank.
function renderBankSection(): void {
  const balanceLi = document.createElement('li');
  balanceLi.className = 'shop-item-divider';
  balanceLi.textContent = `Banked: ${myProfile?.bankedGold ?? 0} gold`;
  shopItemList.appendChild(balanceLi);

  const amountRow = document.createElement('li');
  amountRow.className = 'shop-item';
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.min = '1';
  amountInput.placeholder = 'Amount';
  amountInput.className = 'shop-bank-amount';
  amountRow.appendChild(amountInput);
  shopItemList.appendChild(amountRow);

  const depositRow = document.createElement('li');
  depositRow.className = 'shop-item';
  const depositLabel = document.createElement('span');
  depositLabel.textContent = 'Deposit (free)';
  const depositBtn = document.createElement('button');
  depositBtn.type = 'button';
  depositBtn.textContent = 'Deposit';
  depositBtn.addEventListener('click', () => depositGold(amountInput.value));
  const depositAllBtn = document.createElement('button');
  depositAllBtn.type = 'button';
  depositAllBtn.textContent = 'Deposit all';
  depositAllBtn.addEventListener('click', () => depositGold(undefined));
  depositRow.appendChild(depositLabel);
  depositRow.appendChild(depositBtn);
  depositRow.appendChild(depositAllBtn);
  shopItemList.appendChild(depositRow);

  const withdrawRow = document.createElement('li');
  withdrawRow.className = 'shop-item';
  const withdrawLabel = document.createElement('span');
  withdrawLabel.textContent = 'Withdraw (5% fee)';
  const withdrawBtn = document.createElement('button');
  withdrawBtn.type = 'button';
  withdrawBtn.textContent = 'Withdraw';
  withdrawBtn.addEventListener('click', () => withdrawGold(amountInput.value));
  const withdrawAllBtn = document.createElement('button');
  withdrawAllBtn.type = 'button';
  withdrawAllBtn.textContent = 'Withdraw all';
  withdrawAllBtn.addEventListener('click', () => withdrawGold(undefined));
  withdrawRow.appendChild(withdrawLabel);
  withdrawRow.appendChild(withdrawBtn);
  withdrawRow.appendChild(withdrawAllBtn);
  shopItemList.appendChild(withdrawRow);
}

function parsedAmount(raw: string): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function depositGold(raw: string | undefined): void {
  const amount = raw === undefined ? undefined : parsedAmount(raw);
  if (raw !== undefined && amount === undefined) {
    logCombatMessage('Enter a valid amount first.');
    return;
  }
  network
    .depositGold(amount)
    .then((ack) => applyBankAck(ack))
    .catch(() => {
      /* nothing to show */
    });
}

function withdrawGold(raw: string | undefined): void {
  const amount = raw === undefined ? undefined : parsedAmount(raw);
  if (raw !== undefined && amount === undefined) {
    logCombatMessage('Enter a valid amount first.');
    return;
  }
  network
    .withdrawGold(amount)
    .then((ack) => applyBankAck(ack))
    .catch(() => {
      /* nothing to show */
    });
}

function applyBankAck(ack: { ok: boolean; gold?: number; bankedGold?: number; message?: string }): void {
  if (!ack.ok) {
    if (ack.message) logCombatMessage(ack.message);
    return;
  }
  if (myProfile) {
    setMyProfile({ ...myProfile, gold: ack.gold ?? myProfile.gold, bankedGold: ack.bankedGold ?? myProfile.bankedGold });
    updateStatusBar();
  }
  if (ack.message) logCombatMessage(ack.message);
  renderShopModal();
}

// Item 30's Kortho/Floro Inn "Stay and rest" service.
const INN_REST_COST_GOLD = 5;

function renderInnSection(): void {
  const li = document.createElement('li');
  li.className = 'shop-item';
  const label = document.createElement('span');
  label.textContent = `Stay and rest and get back to 100%! — ${INN_REST_COST_GOLD} gold`;
  const restBtn = document.createElement('button');
  restBtn.type = 'button';
  restBtn.textContent = 'Rest';
  restBtn.addEventListener('click', () => {
    network
      .restAtInn()
      .then((ack) => {
        if (!ack.ok) {
          if (ack.message) logCombatMessage(ack.message);
          return;
        }
        playRestCutscene(() => {
          if (myProfile) {
            setMyProfile({
              ...myProfile,
              gold: ack.gold ?? myProfile.gold,
              hp: ack.hp ?? myProfile.hp,
              maxHp: ack.maxHp ?? myProfile.maxHp,
              mana: ack.mana ?? myProfile.mana,
              maxMana: ack.maxMana ?? myProfile.maxMana,
              mv: ack.mv ?? myProfile.mv,
              maxMv: ack.maxMv ?? myProfile.maxMv,
            });
            updateStatusBar();
          }
          if (ack.message) logCombatMessage(ack.message);
        });
      })
      .catch(() => {
        /* nothing to show */
      });
  });
  li.appendChild(label);
  li.appendChild(restBtn);
  shopItemList.appendChild(li);
}

export function openShopModal(vendor: VendorSnapshot): void {
  closeAllModals();
  currentVendor = vendor;
  shopModalTitle.textContent = vendor.name;
  shopGreeting.textContent = vendor.greeting;
  shopModal.hidden = false;
  updateInputCaptured();
  renderShopModal();
}

function buyVendorItem(itemLabel: string): void {
  if (!currentVendor) return;
  network
    .buyItem(currentVendor.id, itemLabel)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile) {
        setMyProfile({
          ...myProfile,
          inventory: ack.inventory ?? myProfile.inventory,
          gold: ack.gold ?? myProfile.gold,
          canteenDrinks: ack.canteenDrinks ?? myProfile.canteenDrinks,
        });
        refreshOpenModals();
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
      renderShopModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

function sellVendorItem(itemIndex: number): void {
  if (!currentVendor) return;
  network
    .sellItem(currentVendor.id, itemIndex)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile) {
        setMyProfile({ ...myProfile, inventory: ack.inventory ?? myProfile.inventory, gold: ack.gold ?? myProfile.gold });
        refreshOpenModals();
        // A later follow-up bug fix: "when I sold items to a vendor it
        // did not update in the player stat label in the top left
        // immediately" — setMyProfile alone only updates the in-memory
        // profile; nothing was re-rendering the plain-DOM status bar
        // until the next unrelated 'sync' event happened to fire.
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
      renderShopModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

registerModalRefreshHandler(shopModal, renderShopModal);
