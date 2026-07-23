// Shared modal plumbing: the DOM refs every modal-specific module needs,
// the single "which modals exist" list, open/close/toggle, and the
// movement/keyboard-capture rules that depend on which modals are
// currently open (items 7 & 15).
import { activeScene } from '../state.js';
import { chatInputFocused, registerChatFocusListener } from './log.js';
import { attachTooltip, hideCustomTooltip } from './tooltip.js';

export const charSheetModal = document.getElementById('char-sheet-modal') as HTMLDivElement;
export const charSheetUsername = document.getElementById('char-sheet-username') as HTMLHeadingElement;
export const charSheetPreview = document.getElementById('char-sheet-preview') as HTMLDivElement;
export const charSheetBody = document.getElementById('char-sheet-body') as HTMLDivElement;
export const inventoryModal = document.getElementById('inventory-modal') as HTMLDivElement;
export const inventoryList = document.getElementById('inventory-list') as HTMLUListElement;
// The quest log (a follow-up ask) — a list of started quest titles;
// clicking one swaps this same body to a detail view (description +
// objective checklist) instead of opening a second modal.
export const questLogModal = document.getElementById('quest-log-modal') as HTMLDivElement;
export const questLogTitle = document.getElementById('quest-log-title') as HTMLHeadingElement;
export const questLogBody = document.getElementById('quest-log-body') as HTMLDivElement;
// A stationary NPC's own dialogue (a follow-up ask: the Headmistress's
// greeting + her "Quest: Learn spells" button) — generic enough for any
// future quest-giver, not Headmistress-specific itself.
export const npcDialogueModal = document.getElementById('npc-dialogue-modal') as HTMLDivElement;
export const npcDialogueName = document.getElementById('npc-dialogue-name') as HTMLHeadingElement;
export const npcDialogueText = document.getElementById('npc-dialogue-text') as HTMLParagraphElement;
export const npcDialogueActions = document.getElementById('npc-dialogue-actions') as HTMLDivElement;
export const skillsModal = document.getElementById('skills-modal') as HTMLDivElement;
export const skillsBody = document.getElementById('skills-body') as HTMLDivElement;
// Spells and skills are different things (players will eventually have
// both) — a separate modal/button rather than a tab bolted onto Skills.
export const spellsModal = document.getElementById('spells-modal') as HTMLDivElement;
export const spellsBody = document.getElementById('spells-body') as HTMLDivElement;
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
// A later follow-up ask: pet corpses — see petCorpseModal.ts.
export const petCorpseModal = document.getElementById('pet-corpse-modal') as HTMLDivElement;
export const petCorpseModalTitle = document.getElementById('pet-corpse-modal-title') as HTMLHeadingElement;
export const petCorpseItemList = document.getElementById('pet-corpse-item-list') as HTMLUListElement;
export const petCorpseGrabAllBtn = document.getElementById('pet-corpse-grab-all') as HTMLButtonElement;
export const petCorpseSacrificeBtn = document.getElementById('pet-corpse-sacrifice') as HTMLButtonElement;
export const shopModal = document.getElementById('shop-modal') as HTMLDivElement;
export const shopModalTitle = document.getElementById('shop-modal-title') as HTMLHeadingElement;
export const shopGreeting = document.getElementById('shop-greeting') as HTMLDivElement;
export const shopGoldLine = document.getElementById('shop-gold-line') as HTMLDivElement;
export const shopItemList = document.getElementById('shop-item-list') as HTMLUListElement;
// Item 12's dropped-item treasure chest — see droppedChestModal.ts.
export const droppedChestModal = document.getElementById('dropped-chest-modal') as HTMLDivElement;
export const droppedChestModalTitle = document.getElementById('dropped-chest-modal-title') as HTMLHeadingElement;
export const droppedChestItemList = document.getElementById('dropped-chest-item-list') as HTMLUListElement;
export const droppedChestGrabAllBtn = document.getElementById('dropped-chest-grab-all') as HTMLButtonElement;
export const targetInfoModal = document.getElementById('target-info-modal') as HTMLDivElement;
export const targetInfoTitle = document.getElementById('target-info-title') as HTMLHeadingElement;
export const targetInfoBody = document.getElementById('target-info-body') as HTMLDivElement;
export const targetInfoConsideration = document.getElementById('target-info-consideration') as HTMLDivElement;
// The "identify" spell's own small result window (a later follow-up ask)
// — same "title + modal-stats body" shape as the target info modal above,
// just for an inventory item's name/stats/description instead of a
// combat target.
export const identifyModal = document.getElementById('identify-modal') as HTMLDivElement;
export const identifyTitle = document.getElementById('identify-title') as HTMLHeadingElement;
export const identifyBody = document.getElementById('identify-body') as HTMLDivElement;
export const autopilotModal = document.getElementById('autopilot-modal') as HTMLDivElement;
export const autopilotInput = document.getElementById('autopilot-input') as HTMLInputElement;
export const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;
// Shows currently-active timed spells (lucem/celeritas) and their own
// remaining duration (a follow-up ask, e.g. "Lucem - 2m") — read-only,
// same "doesn't obstruct the map" shape as Skills/Inventory.
export const affectsModal = document.getElementById('affects-modal') as HTMLDivElement;
export const affectsBody = document.getElementById('affects-body') as HTMLDivElement;
// The 'h' hotkey (a later follow-up ask) — a static list of every
// chat-typeable command and what it does; read-only, same "doesn't
// obstruct the map" shape as Affects.
export const helpModal = document.getElementById('help-modal') as HTMLDivElement;
export const helpBody = document.getElementById('help-body') as HTMLDivElement;
// The secret room's treasure chest (a follow-up ask) — same "list +
// click an item" shape as the corpse loot modal, just a single fixed
// "map" item instead of a corpse's varying drops.
export const chestModal = document.getElementById('chest-modal') as HTMLDivElement;
export const chestModalTitle = document.getElementById('chest-modal-title') as HTMLHeadingElement;
export const chestItemList = document.getElementById('chest-item-list') as HTMLUListElement;

// Recall's own destination picker (a later follow-up ask) — a plain list
// of every visited point of interest, same "simple clickable list" shape
// as the chest modal above.
export const recallModal = document.getElementById('recall-modal') as HTMLDivElement;
export const recallPoiList = document.getElementById('recall-poi-list') as HTMLUListElement;
// The Summoner's own "monster summons" picker (a later follow-up ask) —
// same plain clickable-list shape as recall's own destination picker
// above, just listing killedMonsterKinds instead of visitedPois.
export const monsterSummonsModal = document.getElementById('monster-summons-modal') as HTMLDivElement;
export const monsterSummonsList = document.getElementById('monster-summons-list') as HTMLUListElement;
// Item 11's Transform spell picker — same plain clickable-list shape as
// the monster summons picker above.
export const transformModal = document.getElementById('transform-modal') as HTMLDivElement;
export const transformList = document.getElementById('transform-list') as HTMLUListElement;
// A Dorms bed's own sleep-confirmation prompt (a later follow-up ask) —
// plain Yes/No, no list.
export const bedModal = document.getElementById('bed-modal') as HTMLDivElement;
export const bedSleepYesBtn = document.getElementById('bed-sleep-yes') as HTMLButtonElement;
export const bedSleepNoBtn = document.getElementById('bed-sleep-no') as HTMLButtonElement;
// A bench's own rest-confirmation prompt (a follow-up ask) — same plain
// Yes/No shape as the bed above.
export const benchModal = document.getElementById('bench-modal') as HTMLDivElement;
export const benchRestYesBtn = document.getElementById('bench-rest-yes') as HTMLButtonElement;
export const benchRestNoBtn = document.getElementById('bench-rest-no') as HTMLButtonElement;
// The Escape-key logout confirmation (a follow-up ask) — no dedicated
// "No" button, same as every other modal: the 'x'/backdrop-click below
// already covers dismissing it.
export const logoutConfirmModal = document.getElementById('logout-confirm-modal') as HTMLDivElement;
export const logoutConfirmYesBtn = document.getElementById('logout-confirm-yes') as HTMLButtonElement;
// A later follow-up ask: "Create an Auction House in both Floro and
// Kortho" — see auctionModal.ts.
export const auctionModal = document.getElementById('auction-modal') as HTMLDivElement;
export const auctionGoldLine = document.getElementById('auction-gold-line') as HTMLDivElement;
export const auctionListingList = document.getElementById('auction-listing-list') as HTMLUListElement;
export const auctionListItemForm = document.getElementById('auction-list-item-form') as HTMLUListElement;

export const ALL_MODALS = [
  charSheetModal,
  inventoryModal,
  questLogModal,
  npcDialogueModal,
  skillsModal,
  spellsModal,
  equipmentModal,
  mapModal,
  affectsModal,
  helpModal,
  corpseModal,
  petCorpseModal,
  droppedChestModal,
  shopModal,
  targetInfoModal,
  identifyModal,
  autopilotModal,
  chestModal,
  recallModal,
  monsterSummonsModal,
  transformModal,
  bedModal,
  benchModal,
  logoutConfirmModal,
  auctionModal,
];

// A later follow-up ask ("make it so that when any modal is open the
// player is able to move, when I opened the recall modal it didn't allow
// me to move") replaced what used to be a hand-picked allowlist here —
// recallModal (and several other modals: corpse/petCorpse/droppedChest/
// targetInfo/identify/autopilot/chest/monsterSummons/transform/bed/bench/
// logoutConfirm) had simply never been added to it, so opening any of
// those silently blocked movement even though nothing about them actually
// needs to. Every modal now passes movement through — see
// isMovementBlocked below, which no longer consults this list at all;
// kept only as a record of the modals this project has, in case a FUTURE
// modal genuinely needs to block movement again (a text-entry prompt
// that WASD keys would collide with, the way chatInputFocused already
// does), which should be its own explicit, narrow check rather than
// reverting to a broad allowlist.
export const MOVEMENT_PASSTHROUGH_MODALS = ALL_MODALS;

export function isMovementBlocked(): boolean {
  return chatInputFocused;
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
  // Closing the Inventory modal clears whatever fillable item was
  // targeted for drink/pour/irrigo (item 10's follow-up ask) — the
  // highlight wouldn't even be visible again until it's reopened, so
  // leaving a stale target selected behind the scenes was confusing.
  if (modal === inventoryModal) activeScene?.clearItemTarget();
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

// A follow-up ask: "only show whole numbers in the player stats, hide
// decimals for any stat" — hunger/thirst now decay by fractional amounts
// per tick (0.4, see game.gateway.ts's applyStatTick) so the underlying
// value needs that precision, but nothing should ever DISPLAY it. Floor
// (not round) so the displayed number never reads higher than what's
// actually left — a stat that's dropped to 99.6 shows 99, not a
// still-100 that only "catches up" a tick later.
export function wholeNumber(value: number): number {
  return Math.floor(value);
}

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

// ---------- Corner buttons — the 6 plain toggleModal-driven ones (the
// autopilot/"prompt" button is wired separately in autopilotModal.ts,
// since dismissing it also needs to stop any active hunt). ----------

const charSheetBtn = document.getElementById('char-sheet-btn') as HTMLButtonElement;
const inventoryBtn = document.getElementById('inventory-btn') as HTMLButtonElement;
const skillsBtn = document.getElementById('skills-btn') as HTMLButtonElement;
const spellsBtn = document.getElementById('spells-btn') as HTMLButtonElement;
const equipmentBtn = document.getElementById('equipment-btn') as HTMLButtonElement;
const mapBtn = document.getElementById('map-btn') as HTMLButtonElement;
const affectsBtn = document.getElementById('affects-btn') as HTMLButtonElement;
const questLogBtn = document.getElementById('quest-log-btn') as HTMLButtonElement;

charSheetBtn.addEventListener('click', () => toggleModal(charSheetModal));
inventoryBtn.addEventListener('click', () => toggleModal(inventoryModal));
skillsBtn.addEventListener('click', () => toggleModal(skillsModal));
spellsBtn.addEventListener('click', () => toggleModal(spellsModal));
equipmentBtn.addEventListener('click', () => toggleModal(equipmentModal));
mapBtn.addEventListener('click', () => toggleModal(mapModal));
affectsBtn.addEventListener('click', () => toggleModal(affectsModal));
questLogBtn.addEventListener('click', () => toggleModal(questLogModal));

// Item 10's zoom toggle — not a modal, just flips WorldScene's own
// camera zoom; the button's label/tooltip flip to reflect the current
// state (shared with keyboard.ts's own 'v' hotkey, so either path stays
// in sync no matter which one the player used last).
const zoomBtn = document.getElementById('zoom-btn') as HTMLButtonElement;
export function updateZoomButtonLabel(): void {
  const zoomedIn = activeScene?.isZoomedIn() ?? false;
  zoomBtn.textContent = zoomedIn ? '🔎' : '🔍';
  zoomBtn.dataset.tooltip = zoomedIn ? 'Zoom out (v)' : 'Zoom in (v)';
}
zoomBtn.addEventListener('click', () => {
  activeScene?.toggleZoom();
  updateZoomButtonLabel();
});

// A single shared collapse button (a follow-up ask), same plain
// toggle-a-class shape as the top-right world-info-toggle.
const cornerButtonsGroup = document.getElementById('corner-buttons') as HTMLDivElement;
const cornerButtonsToggle = document.getElementById('corner-buttons-toggle') as HTMLButtonElement;
cornerButtonsToggle.addEventListener('click', () => {
  const collapsed = cornerButtonsGroup.classList.toggle('collapsed');
  cornerButtonsToggle.textContent = collapsed ? '+' : '−';
});

// A follow-up ask: "just like the spells in the action bar have a
// tooltip pop up with their name, do the same for the icon buttons in
// the right corner" — every corner button's own `data-tooltip` (see
// index.html) through the same custom-tooltip mechanism the action bar
// already uses, rather than the browser's native (unreliable, slow)
// `title` hover.
for (const btn of document.querySelectorAll<HTMLButtonElement>('.corner-btn[data-tooltip]')) {
  attachTooltip(btn, () => btn.dataset.tooltip);
}

// The map corner button (and its 'm' hotkey, see keyboard.ts) is hidden
// until myProfile.mapUnlocked (a follow-up ask — the map is now found in
// the secret room's treasure chest, not given to every character) —
// called on every 'sync' (see WorldScene's applySync) so it flips the
// instant a fresh character doc loads OR the moment the map is actually
// taken out of the chest, whichever happens first.
export function updateMapButtonVisibility(mapUnlocked: boolean): void {
  mapBtn.hidden = !mapUnlocked;
  // A player who had it open via devtools/a stale hotkey before losing
  // access (shouldn't normally happen, but cheap to guard) shouldn't be
  // left staring at a modal they can no longer re-open the normal way.
  if (!mapUnlocked && !mapModal.hidden) hideModal(mapModal);
}

// A later follow-up ask: "make it so that all of the modals that open
// are draggable with a thin line at the top like the group label" —
// same plain pointer-capture drag off a thin handle strip groupPanel.ts
// already uses for the group/follower panel, generalized here to run
// ONCE for every modal in ALL_MODALS rather than one-off per modal
// module. A `.modal-drag-handle` div (see its own CSS comment) is
// injected as each modal-box's first child; dragging it switches that
// ONE modal-box from the CSS default (position: relative, flex-centered
// by its `.modal` parent) to an explicit position: absolute + top/left
// matching wherever it currently sits on screen (`.modal` itself is
// already position:absolute, inset:0, sitting flush with #app's own
// viewport-sized origin, so a viewport-relative getBoundingClientRect
// maps directly onto it) — the same "switch anchor on first
// interaction" pattern #log-panel's own resize/move handles use, so a
// modal opens centered as always until the player actually drags it
// somewhere.
function makeModalDraggable(modal: HTMLDivElement): void {
  const modalBox = modal.querySelector<HTMLDivElement>('.modal-box');
  if (!modalBox) return;
  const handle = document.createElement('div');
  handle.className = 'modal-drag-handle';
  handle.title = 'Drag to move';
  modalBox.insertBefore(handle, modalBox.firstChild);

  let dragPointerId: number | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  handle.addEventListener('pointerdown', (e) => {
    dragPointerId = e.pointerId;
    const rect = modalBox.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    modalBox.style.position = 'absolute';
    modalBox.style.left = `${rect.left}px`;
    modalBox.style.top = `${rect.top}px`;
    modalBox.style.margin = '0';
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (dragPointerId !== e.pointerId) return;
    const maxLeft = window.innerWidth - modalBox.offsetWidth;
    const maxTop = window.innerHeight - modalBox.offsetHeight;
    const left = Math.min(Math.max(0, e.clientX - dragOffsetX), Math.max(0, maxLeft));
    const top = Math.min(Math.max(0, e.clientY - dragOffsetY), Math.max(0, maxTop));
    modalBox.style.left = `${left}px`;
    modalBox.style.top = `${top}px`;
  });
  const stopDragging = (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    handle.releasePointerCapture(e.pointerId);
    dragPointerId = null;
  };
  handle.addEventListener('pointerup', stopDragging);
  handle.addEventListener('pointercancel', stopDragging);
}

for (const modal of ALL_MODALS) {
  makeModalDraggable(modal);
}
