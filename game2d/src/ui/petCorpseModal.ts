// The pet corpse modal (a later follow-up ask: "the corpses of pets
// should be selectable and should open a modal so that the player can
// grab any items or equipment the pet had and the pet should be
// sacrificable") — same "grab all or pick one item" shape as the
// monster-corpse modal (see corpseModal.ts), just simpler: no eat-brains,
// and only ever opened for the owner's own pet in the first place (see
// WorldScene's own pointerdown handler), so there's no separate
// "killed by another player"-style rejection UI needed here.
import { network, setMyProfile, myProfile } from '../state.js';
import { logCombatMessage } from './log.js';
import { updateStatusBar } from './statusBar.js';
import { stackedItemsLabel } from './corpseModal.js';
import {
  closeAllModals,
  petCorpseGrabAllBtn,
  petCorpseItemList,
  petCorpseModal,
  petCorpseModalTitle,
  petCorpseSacrificeBtn,
  updateInputCaptured,
} from './modalCore.js';

let currentCorpseId: string | null = null;
let currentCorpseItems: string[] = [];

function renderPetCorpseModal(): void {
  petCorpseItemList.innerHTML = '';
  petCorpseGrabAllBtn.hidden = currentCorpseItems.length === 0;
  if (currentCorpseItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'inventory-empty';
    li.textContent = 'Nothing left to grab.';
    petCorpseItemList.appendChild(li);
    return;
  }
  currentCorpseItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = 'inventory-item';
    li.title = 'Click to grab';
    li.addEventListener('click', () => grabPetCorpseItem(index));
    petCorpseItemList.appendChild(li);
  });
}

export function openPetCorpseModal(corpseId: string, name: string, items: string[]): void {
  closeAllModals();
  currentCorpseId = corpseId;
  currentCorpseItems = [...items];
  petCorpseModalTitle.textContent = `${name}'s corpse`;
  petCorpseModal.hidden = false;
  updateInputCaptured();
  renderPetCorpseModal();
}

function grabPetCorpseItem(index: number): void {
  if (!currentCorpseId) return;
  network
    .lootPetCorpseItem(currentCorpseId, index)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      const [item] = currentCorpseItems.splice(index, 1);
      if (myProfile && ack.inventory) {
        setMyProfile({ ...myProfile, inventory: ack.inventory });
        updateStatusBar();
      }
      if (item) logCombatMessage(`You pick up the ${item}.`);
      renderPetCorpseModal();
    })
    .catch(() => {
      /* corpse likely already looted/expired — nothing to show */
    });
}

petCorpseGrabAllBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .lootPetCorpse(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (currentCorpseItems.length > 0) logCombatMessage(`You pick up the ${stackedItemsLabel(currentCorpseItems)}.`);
      currentCorpseItems = [];
      if (myProfile && ack.inventory) {
        setMyProfile({ ...myProfile, inventory: ack.inventory });
        updateStatusBar();
      }
      // The corpse itself sticks around empty (same as a monster corpse)
      // in case the player wants to sacrifice it next.
      renderPetCorpseModal();
    })
    .catch(() => {
      /* nothing to show */
    });
});

petCorpseSacrificeBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .sacrificePetCorpse(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile && ack.gold !== undefined) {
        setMyProfile({ ...myProfile, gold: ack.gold });
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
      petCorpseModal.hidden = true;
      updateInputCaptured();
    })
    .catch(() => {
      /* nothing to show */
    });
});
