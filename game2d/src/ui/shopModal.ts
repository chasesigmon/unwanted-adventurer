// The shop modal — a vendor's fixed item list, each with a Buy button.
// Vendors never move or restock, so there's nothing to poll; every
// purchase just re-renders against the same static item list.
import { myProfile, network, setMyProfile } from '../state.js';
import type { VendorSnapshot } from '../../shared/types.js';
import { logCombatMessage } from './log.js';
import { closeAllModals, refreshOpenModals, registerModalRefreshHandler, shopGoldLine, shopGreeting, shopItemList, shopModal, shopModalTitle, updateInputCaptured } from './modalCore.js';

let currentVendor: VendorSnapshot | null = null;

export function renderShopModal(): void {
  shopGoldLine.textContent = `Your gold: ${myProfile?.gold ?? 0}`;
  shopItemList.innerHTML = '';
  if (!currentVendor) return;
  for (const item of currentVendor.items) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    const label = document.createElement('span');
    label.textContent = `${item.label} — ${item.price} gold`;
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = 'Buy';
    buyBtn.addEventListener('click', () => buyVendorItem(item.label));
    li.appendChild(label);
    li.appendChild(buyBtn);
    shopItemList.appendChild(li);
  }
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
      }
      if (ack.message) logCombatMessage(ack.message);
      renderShopModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

registerModalRefreshHandler(shopModal, renderShopModal);
