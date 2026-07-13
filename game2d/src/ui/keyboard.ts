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
  toggleModal,
} from './modalCore.js';
import { openChatInput, openChatInputWithSlash } from './log.js';
import { dismissAutopilotModal } from './autopilotModal.js';

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
      // hunt); anything else open just closes normally.
      if (!autopilotModal.hidden) {
        dismissAutopilotModal();
      } else if (ALL_MODALS.some((m) => !m.hidden)) {
        closeAllModals();
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
    } else if (key === 'x') {
      // A later follow-up ask: "make the player stop auto attacking" —
      // stops whatever combat session (melee or ranged) is currently
      // armed, without needing a modal open at all.
      e.preventDefault();
      activeScene?.stopAutoAttack();
    }
  });
}
