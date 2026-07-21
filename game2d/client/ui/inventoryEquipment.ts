// Inventory + Equipment modals — grouped together since equipping,
// unequipping, consuming, and using an item all funnel through the same
// applyUseItemAck reconciliation of myProfile.
import { activeScene, myProfile, network, setMyProfile } from '../state.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, EQUIPMENT_ITEM_BONUS_LABEL, EQUIPMENT_SLOT_FOR_ITEM, type EquipmentSlot } from '../../shared/equipment.js';
import { CANTEEN_ITEM, CANTEEN_CAPACITY, isFillableItem, isDrinkableItem, isEdibleItem, groupInventoryItems } from '../../shared/items.js';
import { FOLLOWER_EQUIPMENT_SLOTS } from '../../shared/pets.js';
import type { UseItemAck } from '../../shared/types.js';
import { attachTooltip } from './tooltip.js';
import { itemTooltip, ITEM_DESCRIPTIONS } from './skillMeta.js';
import { logCombatMessage } from './log.js';
import { showCenterToastLines } from './toast.js';
import { updateStatusBar } from './statusBar.js';
import { equipmentBody, equipmentModal, inventoryList, inventoryModal, refreshOpenModals, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';
import { getFollowers } from './groupPanel.js';

// ---------- Inventory ----------

// A later follow-up ask relocated the "give item" picker from the group
// panel's own follower cards into here instead — same underlying
// giveFollowerItem call, just initiated from the item's own row rather
// than a dropdown living on the follower's card.
function livingFollowers(): Array<{ followerKind: 'pet' | 'animatedMonster'; followerId: string | undefined; label: string }> {
  const { pet, animatedMonsters } = getFollowers();
  const list: Array<{ followerKind: 'pet' | 'animatedMonster'; followerId: string | undefined; label: string }> = [];
  if (pet?.alive) list.push({ followerKind: 'pet', followerId: undefined, label: pet.name });
  for (const am of animatedMonsters) {
    if (am.alive) list.push({ followerKind: 'animatedMonster', followerId: am.id, label: am.name });
  }
  return list;
}

// A later follow-up ask: "only be able to be given to the follower if it
// can wear that piece of equipment... they shouldn't be able to be given
// mana crystals, etc." — a follower is limited to FOLLOWER_EQUIPMENT_SLOTS
// (weapon/torso only, see shared/pets.ts), so an item that isn't
// equippable AT ALL (a mana crystal) or that fills some OTHER slot a
// follower has no use for (a helmet, a ring) never gets the option.
function isFollowerEquippableItem(item: string): boolean {
  const slot = EQUIPMENT_SLOT_FOR_ITEM[item];
  return slot !== undefined && (FOLLOWER_EQUIPMENT_SLOTS as readonly string[]).includes(slot);
}

// Item 11: "left clicks on an item gives them the option to equip/use/
// drop (equip if its equipment, use if its a consumable)." The server
// alone decides equip-vs-consume once asked (see game.gateway.ts's own
// handleUseItem doc comment) — this is purely which LABEL to show; both
// buttons dispatch the exact same network.useItem call underneath.
function isEquipmentItem(item: string): boolean {
  return EQUIPMENT_SLOT_FOR_ITEM[item] !== undefined;
}

// Which stacked row (keyed by its first index) currently has its Equip/
// Use/Drop menu expanded — at most one at a time, cleared whenever the
// modal is freshly opened or a click lands outside any item row.
let openMenuIndex: number | null = null;

function giveItemToFollower(itemIndex: number, followerKind: 'pet' | 'animatedMonster', followerId: string | undefined): void {
  // FollowerItemAck carries no updated snapshot of its own (see its own
  // doc comment) — the player's own updated inventory arrives via the
  // map:state broadcast this triggers, same as every other follower
  // action already worked before this ask relocated it here.
  network
    .giveFollowerItem({ followerKind, followerId, itemIndex })
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
    })
    .catch(() => {
      /* nothing to show */
    });
}

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
  // name), same as clicking any single unstacked item always did. Sorted
  // alphabetically (see groupInventoryItems's own doc comment) so a
  // stack's position never jumps just because a sell/use/drop removed one
  // copy of it or of some other item.
  const groups = groupInventoryItems(items);

  const followers = livingFollowers();
  for (const [item, indices] of groups) {
    const li = document.createElement('li');
    const baseLabel = indices.length > 1 ? `${item} x${indices.length}` : item;
    // The canteen's own fill level, shown right on its inventory row —
    // there's only ever one, so no need to disambiguate which instance.
    const label = document.createElement('span');
    label.textContent = item === CANTEEN_ITEM ? `${baseLabel} (${myProfile?.canteenDrinks ?? 0}/${CANTEEN_CAPACITY})` : baseLabel;
    li.appendChild(label);
    li.className = 'inventory-item';
    // Bug fix: only a fillable item (the canteen) ever got this highlight
    // or an actual target — identify (which acts on whatever's currently
    // targeted, see WorldScene's useItemTargetedSkill) could therefore
    // only ever be cast on a canteen, never on anything else in the
    // inventory. Every item is targetable now, canteen included.
    if (activeScene?.getItemTarget() === item) li.classList.add('targeted');
    attachTooltip(li, () => itemTooltip(item));
    // Every group has at least one index (it's seeded with one on
    // creation above), so this is always defined.
    li.addEventListener('click', () => {
      // Fillable items (a canteen, item 7 & 11's follow-up asks) aren't
      // used/consumed by clicking — clicking targets them instead, for
      // drink/pour/irrigo (and now identify) to act on from the action
      // bar. Clicking the SAME already-targeted item again de-selects it,
      // rather than leaving no way to clear a target short of clicking
      // elsewhere entirely. No Equip/Use/Drop menu for these — closing
      // one that was open for a DIFFERENT item, so at most one row is
      // ever "focused" at a time.
      if (isFillableItem(item)) {
        if (activeScene?.getItemTarget() === item) activeScene.clearItemTarget();
        else activeScene?.setItemTarget(item);
        openMenuIndex = null;
        renderInventory();
        return;
      }
      // Bug fix: a non-fillable item used to only toggle its Equip/Use/
      // Drop menu, never actually setting a target — meaning identify
      // had no way to select it at all. Targeting it now happens
      // alongside the menu (setItemTarget replaces whatever was targeted
      // before, so a fillable item's own target is naturally dropped by
      // clicking elsewhere, without a separate clearItemTarget call).
      if (activeScene?.getItemTarget() === item) activeScene.clearItemTarget();
      else activeScene?.setItemTarget(item);
      // Item 11: left-clicking a non-fillable item toggles a small
      // Equip/Use/Drop menu instead of immediately dispatching — clicking
      // the SAME already-open row again collapses it.
      openMenuIndex = openMenuIndex === indices[0] ? null : indices[0]!;
      renderInventory();
    });
    // The browser's own right-click context menu is never useful here —
    // captured and replaced with a forced consume, so an otherwise-
    // equippable item (a bone dagger, say) can be eaten for its exp
    // instead of worn. A fillable item (a canteen) right-clicks straight
    // to a drink instead (a follow-up ask) — a quick shortcut alongside
    // the target-then-click-drink-in-the-action-bar path, not a
    // replacement for it.
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isFillableItem(item)) {
        drinkInventoryItem(indices[0]!);
        return;
      }
      consumeInventoryItem(indices[0]!);
    });
    // A later follow-up ask: "add a mechanism from the item modal to
    // give an item to a follower" — relocated from a dropdown that used
    // to live on the follower's own group-panel card (see groupPanel.ts's
    // buildFollowerItemsSection). Only shown when there's actually a
    // living pet/animated monster to give it to AND the item is
    // something a follower could actually wear (see
    // isFollowerEquippableItem's own doc comment); a single follower
    // skips straight to a plain button, a real choice between two+ gets a
    // picker first.
    // A later bug fix: "I had cloth armor in my inventory and then the
    // only option that became available was to give the armor to the
    // cat, I should have also been able to equip or drop it" — this row
    // used to render unconditionally, before the row was even clicked,
    // while Equip/Drop stayed hidden behind openMenuIndex until clicked —
    // so "Give to <pet>" looked like the item's ONLY option. Now gated on
    // the same openMenuIndex click as the Equip/Use/Drop menu below, so
    // all three always appear together.
    if (openMenuIndex === indices[0] && followers.length > 0 && isFollowerEquippableItem(item)) {
      const giveRow = document.createElement('div');
      giveRow.className = 'inventory-give-row';
      // Neither the picker nor the button should also trigger the row's
      // own click(use)/contextmenu(consume) handlers above.
      giveRow.addEventListener('click', (e) => e.stopPropagation());
      giveRow.addEventListener('contextmenu', (e) => e.stopPropagation());
      let select: HTMLSelectElement | null = null;
      if (followers.length > 1) {
        select = document.createElement('select');
        followers.forEach((f, followerIndex) => {
          const option = document.createElement('option');
          option.value = String(followerIndex);
          option.textContent = f.label;
          select!.appendChild(option);
        });
        giveRow.appendChild(select);
      }
      const giveBtn = document.createElement('button');
      giveBtn.type = 'button';
      giveBtn.textContent = followers.length > 1 ? 'Give' : `Give to ${followers[0]!.label}`;
      giveBtn.addEventListener('click', () => {
        const target = followers[select ? Number(select.value) : 0]!;
        giveItemToFollower(indices[0]!, target.followerKind, target.followerId);
      });
      giveRow.appendChild(giveBtn);
      li.appendChild(giveRow);
    }
    // Bug fix: a fillable item's left-click is claimed for action-bar
    // targeting (see the click handler above), so it never gets the
    // ordinary Equip/Use/Drop menu below — shown here instead, as soon as
    // the item IS targeted, so drink/pour/drop are all actually reachable
    // rather than right-click-to-drink being the only thing that worked.
    if (isFillableItem(item) && activeScene?.getItemTarget() === item) {
      const fillableRow = document.createElement('div');
      fillableRow.className = 'inventory-action-row';
      fillableRow.addEventListener('click', (e) => e.stopPropagation());
      fillableRow.addEventListener('contextmenu', (e) => e.stopPropagation());

      const drinkBtn = document.createElement('button');
      drinkBtn.type = 'button';
      drinkBtn.textContent = 'Drink';
      drinkBtn.addEventListener('click', () => drinkInventoryItem(indices[0]!));
      fillableRow.appendChild(drinkBtn);

      const pourBtn = document.createElement('button');
      pourBtn.type = 'button';
      pourBtn.textContent = 'Pour out';
      pourBtn.addEventListener('click', () => pourInventoryItem(indices[0]!));
      fillableRow.appendChild(pourBtn);

      const dropFillableBtn = document.createElement('button');
      dropFillableBtn.type = 'button';
      dropFillableBtn.textContent = 'Drop';
      dropFillableBtn.addEventListener('click', () => {
        activeScene?.clearItemTarget();
        dropInventoryItem(indices[0]!);
      });
      fillableRow.appendChild(dropFillableBtn);

      li.appendChild(fillableRow);
    }
    // Item 11's Equip/Use/Drop menu — only shown for the row currently
    // toggled open (see openMenuIndex above).
    if (openMenuIndex === indices[0]) {
      const menuRow = document.createElement('div');
      menuRow.className = 'inventory-action-row';
      menuRow.addEventListener('click', (e) => e.stopPropagation());
      menuRow.addEventListener('contextmenu', (e) => e.stopPropagation());

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.textContent = isEquipmentItem(item) ? 'Equip' : isDrinkableItem(item) ? 'Drink' : isEdibleItem(item) ? 'Eat' : 'Use';
      actionBtn.addEventListener('click', () => {
        openMenuIndex = null;
        useInventoryItem(indices[0]!);
      });
      menuRow.appendChild(actionBtn);

      const dropBtn = document.createElement('button');
      dropBtn.type = 'button';
      dropBtn.textContent = 'Drop';
      dropBtn.addEventListener('click', () => {
        openMenuIndex = null;
        dropInventoryItem(indices[0]!);
      });
      menuRow.appendChild(dropBtn);

      li.appendChild(menuRow);
    }
    inventoryList.appendChild(li);
  }
}

// Item 12: drops one item on the ground beneath the player, creating (or
// merging into) a dropped-item chest — see droppedChestModal.ts/
// WorldScene's own droppedChestSprites rendering for the loot side.
function dropInventoryItem(index: number): void {
  network
    .dropItem(index)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile && ack.inventory) {
        setMyProfile({ ...myProfile, inventory: ack.inventory });
        refreshOpenModals();
      }
      logCombatMessage('You drop it on the ground.');
    })
    .catch(() => {
      /* nothing to show */
    });
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
      skills: ack.skills ?? myProfile.skills,
      hunger: ack.hunger ?? myProfile.hunger,
      thirst: ack.thirst ?? myProfile.thirst,
    });
    refreshOpenModals();
    activeScene?.refreshEquipmentSprites();
    // A follow-up bug fix: "hunger & thirst... didn't update until a
    // system tick went by" — setMyProfile just updates the in-memory
    // snapshot, it doesn't itself re-render anything; the top-left status
    // label was only ever refreshed by the next periodic statTick
    // broadcast (see WorldScene's own applyOwnStats) until now.
    updateStatusBar();
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

// Right-click on a fillable item (a canteen) — item 9's follow-up ask —
// takes one drink, same reconciliation shape as applyUseItemAck but for
// CanteenActionAck's own (smaller) field set.
function drinkInventoryItem(index: number): void {
  network
    .drinkItem(index)
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
      if (ack.ok && myProfile) {
        setMyProfile({ ...myProfile, canteenDrinks: ack.canteenDrinks ?? myProfile.canteenDrinks, thirst: ack.thirst ?? myProfile.thirst });
        refreshOpenModals();
        updateStatusBar();
      }
    })
    .catch(() => {
      /* nothing to show */
    });
}

// Bug fix: left-clicking a fillable item (a canteen) only ever toggled
// its action-bar target, with no way to actually drop it (handleUseItem
// deliberately rejects it, see its own doc comment, and there was no
// "Drop" affordance anywhere else for it) — right-click-to-drink was the
// only thing that visibly did anything. Pour mirrors drinkInventoryItem
// above for the same reason.
function pourInventoryItem(index: number): void {
  network
    .pourItem(index)
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
      if (ack.ok && myProfile) {
        setMyProfile({ ...myProfile, canteenDrinks: ack.canteenDrinks ?? myProfile.canteenDrinks });
        refreshOpenModals();
        updateStatusBar();
      }
    })
    .catch(() => {
      /* nothing to show */
    });
}

registerModalOpenHandler(inventoryModal, () => {
  openMenuIndex = null;
  renderInventory();
});
registerModalRefreshHandler(inventoryModal, renderInventory);

// "Clicking anywhere on the inventory modal should also de-select the
// item" (a follow-up ask) — the individual item rows already handle
// their own click (target/toggle/clear-and-use, see renderInventory
// above), so this only needs to catch everything ELSE: the modal-box's
// own padding, the "Empty" placeholder, the dark backdrop outside it.
// Checked via closest() during the same bubbling click rather than a
// second listener race, so a click that DID land on a row never
// double-fires against what that row's own handler just decided.
inventoryModal.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.inventory-item')) return;
  activeScene?.clearItemTarget();
  if (openMenuIndex !== null) {
    openMenuIndex = null;
    renderInventory();
  }
});

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
  // A later follow-up ask: "show what bonus a piece of gear actually
  // gives" — a hover tooltip on the item's own name, same convention
  // every other tooltip-bearing label in this project already uses. Item
  // 33 added the item's own plain description (same ITEM_DESCRIPTIONS
  // table the Inventory modal already reads from) above the bonus line,
  // when one exists for this item.
  const bonus = item ? EQUIPMENT_ITEM_BONUS_LABEL[item] : undefined;
  const description = item ? ITEM_DESCRIPTIONS[item] : undefined;
  const tooltip = [description, bonus].filter(Boolean).join('\n\n');
  if (tooltip) {
    attachTooltip(text, () => tooltip);
    text.style.cursor = 'help';
  }
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
