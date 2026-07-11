// Shared modal plumbing: the DOM refs every modal-specific module needs,
// the single "which modals exist" list, open/close/toggle, and the
// movement/keyboard-capture rules that depend on which modals are
// currently open (items 7 & 15).
import { activeScene } from '../state.js';
import { chatInputFocused, registerChatFocusListener } from './log.js';
import { attachTooltip, hideCustomTooltip } from './tooltip.js';

export const charSheetModal = document.getElementById('char-sheet-modal') as HTMLDivElement;
export const charSheetUsername = document.getElementById('char-sheet-username') as HTMLHeadingElement;
export const charSheetBody = document.getElementById('char-sheet-body') as HTMLDivElement;
export const inventoryModal = document.getElementById('inventory-modal') as HTMLDivElement;
export const inventoryList = document.getElementById('inventory-list') as HTMLUListElement;
export const skillsModal = document.getElementById('skills-modal') as HTMLDivElement;
export const skillsBody = document.getElementById('skills-body') as HTMLDivElement;
export const skillsShowAllToggle = document.getElementById('skills-show-all-toggle') as HTMLButtonElement;
export const equipmentModal = document.getElementById('equipment-modal') as HTMLDivElement;
export const equipmentBody = document.getElementById('equipment-body') as HTMLDivElement;
export const mapModal = document.getElementById('map-modal') as HTMLDivElement;
export const mapBody = document.getElementById('map-body') as HTMLDivElement;
export const mapTabCurrentBtn = document.getElementById('map-tab-current') as HTMLButtonElement;
export const mapTabWorldBtn = document.getElementById('map-tab-world') as HTMLButtonElement;
export const mapTabWhoBtn = document.getElementById('map-tab-who') as HTMLButtonElement;
export const mapTabWhereBtn = document.getElementById('map-tab-where') as HTMLButtonElement;
export const corpseModal = document.getElementById('corpse-modal') as HTMLDivElement;
export const corpseModalTitle = document.getElementById('corpse-modal-title') as HTMLHeadingElement;
export const corpseItemList = document.getElementById('corpse-item-list') as HTMLUListElement;
export const corpseGrabAllBtn = document.getElementById('corpse-grab-all') as HTMLButtonElement;
export const corpseEatBrainsBtn = document.getElementById('corpse-eat-brains') as HTMLButtonElement;
export const corpseSacrificeBtn = document.getElementById('corpse-sacrifice') as HTMLButtonElement;
export const shopModal = document.getElementById('shop-modal') as HTMLDivElement;
export const shopModalTitle = document.getElementById('shop-modal-title') as HTMLHeadingElement;
export const shopGreeting = document.getElementById('shop-greeting') as HTMLDivElement;
export const shopGoldLine = document.getElementById('shop-gold-line') as HTMLDivElement;
export const shopItemList = document.getElementById('shop-item-list') as HTMLUListElement;
export const targetInfoModal = document.getElementById('target-info-modal') as HTMLDivElement;
export const targetInfoTitle = document.getElementById('target-info-title') as HTMLHeadingElement;
export const targetInfoBody = document.getElementById('target-info-body') as HTMLDivElement;
export const targetInfoConsideration = document.getElementById('target-info-consideration') as HTMLDivElement;
export const autopilotModal = document.getElementById('autopilot-modal') as HTMLDivElement;
export const autopilotInput = document.getElementById('autopilot-input') as HTMLInputElement;
export const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;

export const ALL_MODALS = [
  charSheetModal,
  inventoryModal,
  skillsModal,
  equipmentModal,
  mapModal,
  corpseModal,
  shopModal,
  targetInfoModal,
  autopilotModal,
];

// None of these five visually obstruct the map and none has a text input
// of its own, so movement stays usable while any of them is open (items 7
// & 15) — a player can browse Skills/Inventory/Equipment/the character
// sheet/the map while still walking around. Every OTHER modal (corpse/
// shop/target-info/autopilot's own text prompt) still blocks movement.
export const MOVEMENT_PASSTHROUGH_MODALS = [inventoryModal, equipmentModal, skillsModal, charSheetModal, mapModal];

export function isMovementBlocked(): boolean {
  return chatInputFocused || ALL_MODALS.some((m) => !m.hidden && !MOVEMENT_PASSTHROUGH_MODALS.includes(m));
}

export function updateInputCaptured(): void {
  // Broad on purpose — used to gate things like click-to-attack and the
  // Enter/"/" chat shortcuts, which should stay off while ANY modal
  // (including a movement-passthrough one) is open, so browsing your
  // inventory doesn't also let a stray click punch something.
  const inputCaptured = chatInputFocused || ALL_MODALS.some((m) => !m.hidden);
  _inputCaptured = inputCaptured;

  // Phaser's global keyboard manager calls preventDefault() on captured
  // keys (W/A/S/D, space, arrows, ...) purely based on keycode — it
  // doesn't check event.target, so it silently ate keystrokes typed into
  // the autopilot prompt's plain HTML <input> even though that input had
  // focus. This used to be toggled off by the same broad `inputCaptured`
  // above, which also disabled it while a movement-passthrough modal
  // (Inventory/Skills/Equipment/character sheet/Map) was open — turning
  // off Phaser's own preventDefault let the bare browser handle arrow
  // keys/space instead (e.g. page-scroll), which is what caused movement
  // to feel unreliable/direction-dependent while those modals were up
  // even though isMovementBlocked() itself never blocked it. Keyboard
  // capture now only turns off for a modal that ACTUALLY blocks movement.
  const keyCaptureBlocked = isMovementBlocked();
  activeScene?.setKeyCaptureEnabled(!keyCaptureBlocked);
}

// A module-level mirror of the `inputCaptured` computed above — exported
// as a live-bound getter-style value for modules (WorldScene's pointerdown
// handler, the global keydown handler) that just need to read it, not
// recompute it.
let _inputCaptured = false;
export function isInputCaptured(): boolean {
  return _inputCaptured;
}

type ModalRenderer = () => void;
// Used by toggleModal when a modal is FIRST opened via its corner
// button/hotkey.
const modalOpenHandlers = new Map<HTMLElement, ModalRenderer>();
// Used by refreshOpenModals whenever something external (a combat event,
// an item use ack, ...) changes data a currently-open modal displays.
const modalRefreshHandlers = new Map<HTMLElement, ModalRenderer>();

export function registerModalOpenHandler(modal: HTMLElement, render: ModalRenderer): void {
  modalOpenHandlers.set(modal, render);
}
export function registerModalRefreshHandler(modal: HTMLElement, render: ModalRenderer): void {
  modalRefreshHandlers.set(modal, render);
}

export function refreshOpenModals(): void {
  for (const modal of ALL_MODALS) {
    if (!modal.hidden) modalRefreshHandlers.get(modal)?.();
  }
}

// Hides a modal without any side effects beyond that — used both by the
// "close everything else before opening this one" path and by the
// autopilot-specific dismissal path (which additionally stops any active
// hunt — see autopilotModal.ts).
export function hideModal(modal: HTMLDivElement): void {
  modal.hidden = true;
  if (modal === autopilotModal) autopilotInput.blur();
  // Item 3: hiding a modal doesn't fire a 'mouseleave' on whatever was
  // hovered inside it (the element can be removed from view without the
  // cursor ever actually moving off it first) — without this, a tooltip
  // shown just before the modal closed had no signal telling it to hide,
  // and stuck around until the NEXT hover anywhere happened to retrigger
  // it.
  hideCustomTooltip();
}

export function closeAllModals(): void {
  for (const modal of ALL_MODALS) hideModal(modal);
  updateInputCaptured();
}

// Char sheet / inventory / skills / equipment / map: plain toggle,
// closing any OTHER open modal first. Deliberately does NOT touch
// autopilot tracking — opening your inventory mid-hunt shouldn't cancel
// it.
export function toggleModal(modal: HTMLDivElement): void {
  const wasOpen = !modal.hidden;
  closeAllModals();
  if (wasOpen) return;
  modal.hidden = false;
  updateInputCaptured();
  modalOpenHandlers.get(modal)?.();
}

// autopilotModal is deliberately excluded from both generic listeners
// below — dismissing it needs to also stop the active hunt (see
// autopilotModal.ts's own dismissAutopilotModal/click-outside/close-button
// wiring), not just hide it.
for (const modal of ALL_MODALS) {
  if (modal === autopilotModal) continue;
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;
    hideModal(modal);
    updateInputCaptured();
  });
}
for (const btn of document.querySelectorAll<HTMLButtonElement>('.modal-close')) {
  const modal = btn.closest('.modal') as HTMLDivElement | null;
  if (modal === autopilotModal) continue;
  btn.addEventListener('click', () => closeAllModals());
}

// Recompute the broad inputCaptured/keyboard-capture state whenever the
// chat box gains or loses focus, same as every modal open/close already
// does above.
registerChatFocusListener(updateInputCaptured);

// Shared stat-row renderer (char sheet + target info) — a label/value
// pair, with an optional hover tooltip on the label.
export function appendStatRow(container: HTMLDivElement, label: string, value: string | number, description?: string): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;
  // Only a stat with a real description gets the "more info here"
  // tooltip cursor — everything else (Race, Level, HP, Mana, Movement,
  // ...) explicitly stays the default arrow rather than whatever a bare
  // text node would otherwise pick up (an I-beam, in most browsers,
  // since it reads as selectable text).
  if (description) {
    attachTooltip(labelEl, () => description);
    labelEl.style.cursor = 'help';
  } else {
    labelEl.style.cursor = 'default';
  }
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = String(value);
  container.appendChild(labelEl);
  container.appendChild(valueEl);
}

// ---------- Corner buttons — the 5 plain toggleModal-driven ones (the
// autopilot/"prompt" button is wired separately in autopilotModal.ts,
// since dismissing it also needs to stop any active hunt). ----------

const charSheetBtn = document.getElementById('char-sheet-btn') as HTMLButtonElement;
const inventoryBtn = document.getElementById('inventory-btn') as HTMLButtonElement;
const skillsBtn = document.getElementById('skills-btn') as HTMLButtonElement;
const equipmentBtn = document.getElementById('equipment-btn') as HTMLButtonElement;
const mapBtn = document.getElementById('map-btn') as HTMLButtonElement;

charSheetBtn.addEventListener('click', () => toggleModal(charSheetModal));
inventoryBtn.addEventListener('click', () => toggleModal(inventoryModal));
skillsBtn.addEventListener('click', () => toggleModal(skillsModal));
equipmentBtn.addEventListener('click', () => toggleModal(equipmentModal));
mapBtn.addEventListener('click', () => toggleModal(mapModal));
