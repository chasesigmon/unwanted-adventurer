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
  helpModal,
  questLogModal,
  toggleModal,
  updateZoomButtonLabel,
} from './modalCore.js';
import { openChatInput, openChatInputWithSlash } from './log.js';
import { dismissAutopilotModal } from './autopilotModal.js';
import { openLogoutConfirmModal } from './logoutModal.js';
import { comboForKeyboardEvent, triggerHotkeyIfBound } from './actionBars.js';

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

    // A later follow-up ask: "capture the tab button being pressed and
    // prevent default. The tab button should instead try to select the
    // closest monster or player" — preventDefault unconditionally (Tab's
    // browser default of shifting focus around the page is never useful
    // here), but only actually cycle targets while not already typing
    // somewhere else captured (same gate Enter/'/' use above).
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!isInputCaptured()) activeScene?.cycleTabTarget();
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
    } else if (key === 'h') {
      // A later follow-up ask — a Help modal listing every chat-typeable
      // command and what it does (shared/commands.ts).
      e.preventDefault();
      toggleModal(helpModal);
    } else if (key === 'x') {
      // A later follow-up ask made this a real toggle: stops whatever
      // combat session is currently armed (the original ask), or — if
      // nothing's currently engaged and a monster/player is already
      // selected — starts attacking it, same as right-clicking would.
      e.preventDefault();
      activeScene?.toggleAutoAttack();
    } else if (key === 'z') {
      // A later follow-up ask: send a pet/animated monster to attack the
      // currently selected target (see WorldScene.commandFollowerAttack).
      e.preventDefault();
      activeScene?.commandFollowerAttack();
    } else if (key === 'v') {
      // Item 10's zoom toggle (see WorldScene.toggleZoom) — same corner-
      // button-plus-hotkey shape as every other single-key toggle here.
      e.preventDefault();
      activeScene?.toggleZoom();
      updateZoomButtonLabel();
    } else if (e.code === 'Space') {
      // The flight spell's own spacebar burst (a later follow-up ask) —
      // only meaningful while actually flying; WorldScene's own
      // triggerFlightBurst no-ops (with a log line) otherwise, same as
      // any other spell attempted without its prerequisite.
      e.preventDefault();
      activeScene?.triggerFlightBurst();
    } else {
      // Item 3: every action-bar slot's hotkey is now fully customizable
      // (any bar, any slot, any modifier combo — see actionBars.ts's own
      // ActionBarSlotConfig.hotkey doc comment and settingsModal.ts's own
      // rebind UI), replacing the old fixed "1-9,0 / Shift+1-9,0" mapping.
      // `e.code` (the physical key), not `e.key` — Shift+1 changes `e.key`
      // entirely on a US layout ('!'), but `e.code` stays 'Digit1' either
      // way; comboForKeyboardEvent uses the same convention every stored
      // hotkey does.
      if (triggerHotkeyIfBound(comboForKeyboardEvent(e))) {
        e.preventDefault();
      }
    }
  });
}
