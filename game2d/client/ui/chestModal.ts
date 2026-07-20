// The secret room's treasure chest loot modal (a later follow-up ask) —
// opened directly by WorldScene's chest-sprite click handler (there's no
// corner button/hotkey for it, unlike every other modal here), same
// "click an item to take it" shape as corpseModal.ts's loot list, just a
// single fixed 'map' item that only ever appears once per player (see
// game.gateway.ts's handleOpenChest/handleTakeChestItem).
import { myProfile, network, setMyProfile } from '../state.js';
import { logCombatMessage } from './log.js';
import { chestItemList, chestModal, closeAllModals, updateInputCaptured, updateMapButtonVisibility } from './modalCore.js';

let currentChestItems: string[] = [];

function renderChestModal(): void {
  chestItemList.innerHTML = '';
  if (currentChestItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'inventory-empty';
    li.textContent = 'The chest is empty.';
    chestItemList.appendChild(li);
    return;
  }
  currentChestItems.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = 'inventory-item';
    li.title = 'Click to take';
    li.addEventListener('click', () => takeChestItem());
    chestItemList.appendChild(li);
  });
}

export function openChestModal(items: string[]): void {
  closeAllModals();
  currentChestItems = [...items];
  chestModal.hidden = false;
  updateInputCaptured();
  renderChestModal();
}

function takeChestItem(): void {
  network
    .takeChestItem()
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      currentChestItems = [];
      if (myProfile && ack.player) {
        setMyProfile(ack.player);
        updateMapButtonVisibility(Boolean(ack.player.mapUnlocked));
      }
      if (ack.message) logCombatMessage(ack.message);
      renderChestModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}
