// Inventory + Equipment modals — grouped together since equipping,
// unequipping, consuming, and using an item all funnel through the same
// applyUseItemAck reconciliation of myProfile.
import { activeScene, myProfile, network, setMyProfile } from '../state.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type EquipmentSlot } from '../../shared/equipment.js';
import { CANTEEN_ITEM, CANTEEN_CAPACITY, isFillableItem } from '../../shared/items.js';
import type { UseItemAck } from '../../shared/types.js';
import { attachTooltip } from './tooltip.js';
import { itemTooltip } from './skillMeta.js';
import { logCombatMessage } from './log.js';
import { showCenterToastLines } from './toast.js';
import { equipmentBody, equipmentModal, inventoryList, inventoryModal, refreshOpenModals, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

// ---------- Inventory ----------

export function renderInventory(): void {
  inventoryList.innerHTML = '';
  const items = myProfile?.inventory ?? [];
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'inventory-empty';
    li.textContent = 'Empty — go loot something.';
    inventoryList.appendChild(li);
    return;
  }
  // Stack identical items into a single "item x3" line rather than a
  // repeated line per copy. The server's inventory stays a flat array
  // (it has no concept of stacks) — this is purely a display grouping;
  // clicking a stack acts on one instance (the first index sharing that
  // name), same as clicking any single unstacked item always did.
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const indices = groups.get(item);
    if (indices) indices.push(index);
    else groups.set(item, [index]);
  });

  for (const [item, indices] of groups) {
    const li = document.createElement('li');
    const baseLabel = indices.length > 1 ? `${item} x${indices.length}` : item;
    // The canteen's own fill level, shown right on its inventory row —
    // there's only ever one, so no need to disambiguate which instance.
    li.textContent = item === CANTEEN_ITEM ? `${baseLabel} (${myProfile?.canteenDrinks ?? 0}/${CANTEEN_CAPACITY})` : baseLabel;
    li.className = 'inventory-item';
    if (isFillableItem(item) && activeScene?.getItemTarget() === item) li.classList.add('targeted');
    attachTooltip(li, () => itemTooltip(item));
    // Every group has at least one index (it's seeded with one on
    // creation above), so this is always defined.
    li.addEventListener('click', () => {
      // Fillable items (a canteen, item 7 & 11's follow-up asks) aren't
      // used/consumed by clicking — clicking targets them instead, for
      // drink/pour/irrigo to act on from the action bar.
      if (isFillableItem(item)) {
        activeScene?.setItemTarget(item);
        renderInventory();
        return;
      }
      useInventoryItem(indices[0]!);
    });
    // The browser's own right-click context menu is never useful here —
    // captured and replaced with a forced consume, so an otherwise-
    // equippable item (a bone dagger, say) can be eaten for its exp
    // instead of worn. Fillable items skip this (the server would refuse
    // it anyway — see game.gateway.ts's handleConsumeItem).
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isFillableItem(item)) return;
      consumeInventoryItem(indices[0]!);
    });
    inventoryList.appendChild(li);
  }
}

function applyUseItemAck(ack: UseItemAck): void {
  if (!ack.ok) {
    if (ack.message) logCombatMessage(ack.message);
    return;
  }
  if (myProfile) {
    setMyProfile({
      ...myProfile,
      inventory: ack.inventory ?? myProfile.inventory,
      equipment: ack.equipment ?? myProfile.equipment,
      consumeExp: ack.consumeExp ?? myProfile.consumeExp,
      skills: ack.skills ?? myProfile.skills,
    });
    refreshOpenModals();
    activeScene?.refreshEquipmentSprites();
  }
  const actionMessage = ack.action === 'equipped' ? 'You equip it.' : ack.action === 'unequipped' ? 'You remove it.' : 'You consume it.';
  logCombatMessage(actionMessage);
  if (ack.message) {
    logCombatMessage(ack.message, 'level-up');
    // Item 1: consuming an item only ever populates this message for a
    // skill grant, an "already learned" notice, an evolution, or a
    // mimic-learn — every one of those is toast-worthy, unlike the plain
    // equip/unequip/consume action line above.
    showCenterToastLines(ack.message);
  }
}

// Left-click asks the server to decide consume-vs-equip — the client has
// no copy of that logic, it just reflects whatever the server did.
function useInventoryItem(index: number): void {
  network.useItem(index).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

// Right-click always forces a consume, even for an equippable item.
function consumeInventoryItem(index: number): void {
  network.consumeItem(index).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

registerModalOpenHandler(inventoryModal, renderInventory);
registerModalRefreshHandler(inventoryModal, renderInventory);

// ---------- Equipment ----------

// A slot with something equipped gets a small 'x' next to it — built by
// hand rather than reusing appendStatRow, same reasoning as the Skills
// modal's own renderSkillRow.
function renderEquipmentRow(slot: EquipmentSlot, label: string, item: string | undefined): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value equipment-value';
  const text = document.createElement('span');
  text.textContent = item ?? '(none)';
  valueEl.appendChild(text);

  if (item) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'equipment-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = `Remove ${item}`;
    removeBtn.addEventListener('click', () => unequipSlot(slot));
    valueEl.appendChild(removeBtn);
  }

  equipmentBody.appendChild(labelEl);
  equipmentBody.appendChild(valueEl);
}

function unequipSlot(slot: EquipmentSlot): void {
  network.unequipItem(slot).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

export function renderEquipment(): void {
  if (!myProfile) return;
  equipmentBody.innerHTML = '';
  for (const slot of EQUIPMENT_SLOTS) {
    renderEquipmentRow(slot, EQUIPMENT_SLOT_LABELS[slot], myProfile.equipment[slot]);
  }
}

registerModalOpenHandler(equipmentModal, renderEquipment);
registerModalRefreshHandler(equipmentModal, renderEquipment);
