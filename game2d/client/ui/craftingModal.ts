// The Crafting Shop's own crafting table modal (a later follow-up ask) —
// a 3x3 staging grid (each slot a {item, count} stack, not one literal
// item instance — see shared/crafting.ts's own doc comment on why a
// slot needs to hold up to 10 mana crystals at once), a hint message, an
// output "queue" slot for the last crafted-but-unclaimed item, and a
// Craft button gated on at least 2 items being staged.
//
// The 3x3 grid is PURELY client-side staging state until Craft is
// clicked — adding an item here doesn't touch the real inventory at all
// (no server round-trip), so removing one just clears the local slot.
// Only the Craft button's own request ever consumes real inventory items
// server-side (see shared/crafting.ts's matchRecipe / game.gateway.ts's
// handleCraftItem).
import { myProfile, network, setMyProfile } from '../state.js';
import { logCombatMessage, logAckMessage } from './log.js';
import { updateStatusBar } from './statusBar.js';
import {
  craftingModal,
  craftingGrid,
  craftingOutputSlot,
  craftingCraftBtn,
  craftingSpinnerOverlay,
  closeAllModals,
  refreshOpenModals,
  registerModalRefreshHandler,
  updateInputCaptured,
} from './modalCore.js';

const CRAFTING_SLOT_COUNT = 9;
// "There is a minimum requirement of at least 2 items present in the
// modal in order for the 'Craft' button to be clickable."
const MIN_ITEMS_TO_CRAFT = 2;
// "A spinner over the crafting table modal for 3 seconds that disables
// actions."
const CRAFT_SPINNER_MS = 3000;

interface CraftingSlotState {
  item: string;
  count: number;
}

let craftingSlots: Array<CraftingSlotState | null> = new Array(CRAFTING_SLOT_COUNT).fill(null);
// True from the moment Craft is clicked until the 3s spinner (plus
// whatever the server round-trip itself took) finishes — blocks every
// other action on this modal in the meantime.
let crafting = false;

const craftingSlotEls: HTMLDivElement[] = [];
for (let i = 0; i < CRAFTING_SLOT_COUNT; i++) {
  const slot = document.createElement('div');
  slot.className = 'crafting-slot';
  slot.addEventListener('click', () => {
    if (crafting) return;
    craftingSlots[i] = null;
    renderCraftingGrid();
  });
  craftingGrid.appendChild(slot);
  craftingSlotEls.push(slot);
}

function renderCraftingGrid(): void {
  craftingSlots.forEach((slotState, i) => {
    const el = craftingSlotEls[i]!;
    el.classList.toggle('filled', slotState !== null);
    if (!slotState) {
      el.textContent = '';
      el.title = '';
      return;
    }
    el.textContent = slotState.count > 1 ? `${slotState.item} x${slotState.count}` : slotState.item;
    el.title = 'Click to remove from the crafting table';
  });
  const totalItems = craftingSlots.reduce((sum, s) => sum + (s?.count ?? 0), 0);
  craftingCraftBtn.disabled = crafting || totalItems < MIN_ITEMS_TO_CRAFT;
}

// Called from inventoryEquipment.ts's own "Add to crafting table" button
// (only shown at all while this modal is open — see isCraftingModalOpen).
// Stacks onto an existing slot already holding the same item, otherwise
// claims the first empty slot; does nothing (just a log line) if neither
// is available.
export function addItemToCraftingTable(item: string): void {
  if (crafting) return;
  const existingIndex = craftingSlots.findIndex((s) => s?.item === item);
  if (existingIndex !== -1) {
    craftingSlots[existingIndex]!.count += 1;
    renderCraftingGrid();
    return;
  }
  const emptyIndex = craftingSlots.findIndex((s) => s === null);
  if (emptyIndex === -1) {
    logCombatMessage('The crafting table is full.');
    return;
  }
  craftingSlots[emptyIndex] = { item, count: 1 };
  renderCraftingGrid();
}

export function isCraftingModalOpen(): boolean {
  return !craftingModal.hidden;
}

function renderOutputSlot(): void {
  const pending = myProfile?.pendingCraftedItem;
  craftingOutputSlot.hidden = !pending;
  if (pending) {
    craftingOutputSlot.textContent = pending;
    craftingOutputSlot.title = 'Click to add this to your inventory';
  }
}

craftingOutputSlot.addEventListener('click', () => {
  if (crafting) return;
  network
    .claimCraftedItem()
    .then((ack) => {
      if (!ack.ok) {
        logAckMessage(ack);
        return;
      }
      if (myProfile && ack.inventory) {
        setMyProfile({ ...myProfile, inventory: ack.inventory, pendingCraftedItem: null });
        refreshOpenModals();
        updateStatusBar();
      }
      logCombatMessage('You add the crafted item to your inventory.');
      renderOutputSlot();
    })
    .catch(() => {
      /* nothing to show */
    });
});

function finishCraftAttempt(ack: { ok: boolean; resultItem?: string; inventory?: string[]; message?: string }): void {
  crafting = false;
  craftingSpinnerOverlay.hidden = true;
  if (!ack.ok) {
    if (ack.message) logCombatMessage(ack.message);
    renderCraftingGrid(); // re-enable, keep the staged items for the player to adjust and retry
    return;
  }
  // Success — the ingredients are really gone now (see game.gateway.ts's
  // handleCraftItem); clear the staging grid entirely and reflect the
  // server's own authoritative post-craft inventory/pending item.
  craftingSlots = new Array(CRAFTING_SLOT_COUNT).fill(null);
  if (myProfile && ack.inventory) {
    setMyProfile({ ...myProfile, inventory: ack.inventory, pendingCraftedItem: ack.resultItem ?? null });
    refreshOpenModals();
    updateStatusBar();
  }
  if (ack.resultItem) logCombatMessage(`You craft ${ack.resultItem}!`, 'level-up');
  renderCraftingGrid();
  renderOutputSlot();
}

craftingCraftBtn.addEventListener('click', () => {
  if (crafting) return;
  const totalItems = craftingSlots.reduce((sum, s) => sum + (s?.count ?? 0), 0);
  if (totalItems < MIN_ITEMS_TO_CRAFT) return;
  crafting = true;
  craftingSpinnerOverlay.hidden = false;
  craftingCraftBtn.disabled = true;
  const slotsPayload = craftingSlots.map((s) => (s ? { item: s.item, count: s.count } : null));
  const startedAt = Date.now();
  network
    .craftItem(slotsPayload)
    .then((ack) => {
      const remaining = Math.max(0, CRAFT_SPINNER_MS - (Date.now() - startedAt));
      setTimeout(() => finishCraftAttempt(ack), remaining);
    })
    .catch(() => {
      setTimeout(() => finishCraftAttempt({ ok: false, message: 'Something went wrong.' }), CRAFT_SPINNER_MS);
    });
});

export function openCraftingModal(): void {
  // A later follow-up ask: "while the Crafting table modal is open the
  // player can also open the inventory modal alongside it" — passing
  // itself through preserves an already-open inventory modal (see
  // modalCore.ts's own closeAllModals doc comment).
  closeAllModals(craftingModal);
  craftingSlots = new Array(CRAFTING_SLOT_COUNT).fill(null);
  crafting = false;
  craftingSpinnerOverlay.hidden = true;
  craftingModal.hidden = false;
  updateInputCaptured();
  renderCraftingGrid();
  renderOutputSlot();
  // If the Inventory modal was already open when the crafting table was
  // clicked, its own item rows need a re-render to pick up the new "Add
  // to crafting table" option (see inventoryEquipment.ts's own
  // isCraftingModalOpen check) — a fresh open of the inventory modal
  // AFTER this one would already see it, but an already-rendered one
  // wouldn't without this.
  refreshOpenModals();
}

registerModalRefreshHandler(craftingModal, () => {
  renderOutputSlot();
});
