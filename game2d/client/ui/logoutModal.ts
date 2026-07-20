// The Escape-key logout confirmation (a follow-up ask: "pressing escape
// with nothing selected should bring up a modal asking if the player
// wants to logout") — opened by keyboard.ts once autopilot/an open
// modal/a selection have all already been ruled out. Reuses the exact
// same "leave the character session, then reload back to character
// select" logic the corner logout button (statusBar.ts) already uses.
import { network } from '../state.js';
import { closeAllModals, logoutConfirmModal, logoutConfirmYesBtn, updateInputCaptured } from './modalCore.js';

export function openLogoutConfirmModal(): void {
  closeAllModals();
  logoutConfirmModal.hidden = false;
  updateInputCaptured();
}

logoutConfirmYesBtn.addEventListener('click', () => {
  void network.leaveCharacterSession().finally(() => window.location.reload());
});
