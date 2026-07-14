// The global document-level keydown handler — hotkeys for every modal,
// Enter/"/" to open chat, and Escape (item 8: closes whatever modal is
// open, in addition to its prior "stop autopilot" behavior).
import { activeScene, myProfile } from '../state.js';
import {
  isInputCaptured,
  ALL_MODALS,
  autopilotModal,
  charSheetModal,
  closeAllModals,
  equipmentModal,
  inventoryModal,
  mapModal,
  skillsModal,
  spellsModal,
  affectsModal,
  questLogModal,
  toggleModal,
} from './modalCore.js';
import { openChatInput, openChatInputWithSlash } from './log.js';
import { dismissAutopilotModal } from './autopilotModal.js';
import { openLogoutConfirmModal } from './logoutModal.js';
import { triggerActionSlot } from './actionBar.js';

const gameRoot = document.getElementById('game-root') as HTMLDivElement;

export function initGlobalKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (gameRoot.hidden) return;
    const target = e.target as HTMLElement;
    // Only bail out while actually typing somewhere (the autopilot
    // prompt's input, say) — NOT whenever any modal happens to be open,
    // since that would also block the very shortcut that's supposed to
    // CLOSE the open modal (e.g. pressing 'c' again to close the char
    // sheet).
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      // Previously only stopped autopilot — every other open modal
      // (corpse, shop, target info, char sheet, inventory, ...) had no
      // Escape shortcut at all (item 8). The prompt/autopilot modal keeps
      // its own dedicated dismissAutopilotModal (which also ends the
      // hunt); anything else open just closes normally. A later follow-up
      // ask extends this further, in priority order: with nothing open,
      // Escape deselects whatever's currently targeted (a player/npc/
      // monster, a door/chest, or a summoned stone block) if anything is;
      // with NEITHER a modal open NOR a selection to clear, it's read as
      // "I want to leave" and offers a logout confirmation instead.
      if (!autopilotModal.hidden) {
        dismissAutopilotModal();
      } else if (ALL_MODALS.some((m) => !m.hidden)) {
        closeAllModals();
      } else if (activeScene?.hasSelection()) {
        activeScene.clearSelection();
      } else {
        openLogoutConfirmModal();
      }
      activeScene?.stopAutopilot('Autopilot stopped.');
      return;
    }

    if (e.key === 'Enter' && !isInputCaptured()) {
      e.preventDefault();
      openChatInput();
      return;
    }

    // "/" almost always means "I want to type a command" — jump straight
    // to Chat with the "/" already typed, rather than making the player
    // open chat and type it themselves.
    if (e.key === '/' && !isInputCaptured()) {
      e.preventDefault();
      openChatInputWithSlash();
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'c') {
      e.preventDefault();
      toggleModal(charSheetModal);
    } else if (key === 'i') {
      e.preventDefault();
      toggleModal(inventoryModal);
    } else if (key === 'k') {
      e.preventDefault();
      toggleModal(skillsModal);
    } else if (key === 'l') {
      e.preventDefault();
      toggleModal(spellsModal);
    } else if (key === 'e') {
      e.preventDefault();
      toggleModal(equipmentModal);
    } else if (key === 'm') {
      // Gated behind myProfile.mapUnlocked now (a follow-up ask: "the
      // ability to press 'm'" is something the player has to actually
      // FIND, via the secret room's treasure chest, not something every
      // character starts with) — same silent no-op the corner button's
      // own `hidden` attribute gives when it isn't shown at all.
      if (!myProfile?.mapUnlocked) return;
      e.preventDefault();
      toggleModal(mapModal);
    } else if (key === 'f') {
      e.preventDefault();
      toggleModal(affectsModal);
    } else if (key === 'q') {
      e.preventDefault();
      toggleModal(questLogModal);
    } else if (key === 'x') {
      // A later follow-up ask: "make the player stop auto attacking" —
      // stops whatever combat session (melee or ranged) is currently
      // armed, without needing a modal open at all.
      e.preventDefault();
      activeScene?.stopAutoAttack();
    } else {
      // The action bar's own two groups of 10 slots (a follow-up ask) —
      // 1-9 then 0 map onto slots 0-9 in order, Shift+(1-9,0) onto slots
      // 10-19, triggering whatever's slotted there the exact same way
      // clicking it would (see actionBar.ts's triggerActionSlot, shared
      // with the slot's own click handler). Same mapping regardless of
      // which side the bar is currently docked to — docking only changes
      // where each slot is drawn on screen, not which hotkey reaches it.
      // `e.code` (the physical key), not `e.key` — Shift+1 changes `e.key`
      // entirely on a US layout ('!'), but `e.code` stays 'Digit1' either
      // way.
      const digitCodes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
      const digitIndex = digitCodes.indexOf(e.code);
      if (digitIndex !== -1) {
        e.preventDefault();
        triggerActionSlot(e.shiftKey ? digitIndex + 10 : digitIndex);
      }
    }
  });
}
