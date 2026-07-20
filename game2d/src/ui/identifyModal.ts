// The "identify" spell's own result window (a later follow-up ask) —
// "select an item from the inventory and then use the identify spell...
// open another small window with the name and stats and description of
// the item." Reuses the SAME item description/equipment-bonus data
// already shown as tooltips/in the Equipment modal (see skillMeta.ts's
// ITEM_DESCRIPTIONS/itemTooltip and equipment.ts's EQUIPMENT_ITEM_BONUS_LABEL)
// rather than a separate data source.
import { identifyModal, identifyTitle, identifyBody, closeAllModals, updateInputCaptured, appendStatRow } from './modalCore.js';
import { ITEM_DESCRIPTIONS } from './skillMeta.js';
import { EQUIPMENT_ITEM_BONUS_LABEL, EQUIPMENT_SLOT_FOR_ITEM, EQUIPMENT_SLOT_LABELS } from '../../shared/equipment.js';

export function openIdentifyModal(itemLabel: string): void {
  identifyTitle.textContent = itemLabel;
  identifyBody.innerHTML = '';
  const slot = EQUIPMENT_SLOT_FOR_ITEM[itemLabel];
  if (slot) appendStatRow(identifyBody, 'Slot', EQUIPMENT_SLOT_LABELS[slot]);
  const bonus = EQUIPMENT_ITEM_BONUS_LABEL[itemLabel];
  if (bonus) appendStatRow(identifyBody, 'Bonus', bonus);
  const description = ITEM_DESCRIPTIONS[itemLabel] ?? 'A plain item — nothing more is known about it.';
  const descriptionEl = document.createElement('div');
  descriptionEl.textContent = description;
  identifyBody.appendChild(descriptionEl);
  closeAllModals();
  identifyModal.hidden = false;
  updateInputCaptured();
}
