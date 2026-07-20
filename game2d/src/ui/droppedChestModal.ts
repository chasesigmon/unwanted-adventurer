// Item 12's dropped-item treasure chest — same "grab-all/pick-one" shape
// as the pet corpse modal (see petCorpseModal.ts), but unlike either
// corpse modal the chest itself is gone the instant its last item is
// taken, so this modal closes rather than sticking around empty.
import { myProfile, network, setMyProfile } from '../state.js';
import { logCombatMessage } from './log.js';
import { stackedItemsLabel } from './corpseModal.js';
import {
  closeAllModals,
  droppedChestGrabAllBtn,
  droppedChestItemList,
  droppedChestModal,
  droppedChestModalTitle,
  hideModal,
  updateInputCaptured,
} from './modalCore.js';

let currentChestId: string | null = null;
let currentChestItems: string[] = [];

function renderDroppedChestModal(): void {
  droppedChestItemList.innerHTML = '';
  droppedChestGrabAllBtn.hidden = currentChestItems.length === 0;
  currentChestItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = 'inventory-item';
    li.title = 'Click to grab';
    li.addEventListener('click', () => grabDroppedChestItem(index));
    droppedChestItemList.appendChild(li);
  });
}

export function openDroppedChestModal(chestId: string, items: string[]): void {
  closeAllModals();
  currentChestId = chestId;
  currentChestItems = [...items];
  droppedChestModalTitle.textContent = 'Chest';
  droppedChestModal.hidden = false;
  updateInputCaptured();
  renderDroppedChestModal();
}

function closeIfGone(chestGone: boolean | undefined): void {
  if (!chestGone) return;
  currentChestId = null;
  currentChestItems = [];
  hideModal(droppedChestModal);
  updateInputCaptured();
}

function grabDroppedChestItem(index: number): void {
  if (!currentChestId) return;
  network
    .lootDroppedChestItem(currentChestId, index)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      const [item] = currentChestItems.splice(index, 1);
      if (myProfile && ack.inventory) setMyProfile({ ...myProfile, inventory: ack.inventory });
      if (item) logCombatMessage(`You pick up the ${item}.`);
      renderDroppedChestModal();
      closeIfGone(ack.chestGone);
    })
    .catch(() => {
      /* chest likely already looted by someone else — nothing to show */
    });
}

droppedChestGrabAllBtn.addEventListener('click', () => {
  if (!currentChestId) return;
  network
    .lootDroppedChest(currentChestId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (currentChestItems.length > 0) logCombatMessage(`You pick up the ${stackedItemsLabel(currentChestItems)}.`);
      currentChestItems = [];
      if (myProfile && ack.inventory) setMyProfile({ ...myProfile, inventory: ack.inventory });
      renderDroppedChestModal();
      closeIfGone(ack.chestGone);
    })
    .catch(() => {
      /* nothing to show */
    });
});
