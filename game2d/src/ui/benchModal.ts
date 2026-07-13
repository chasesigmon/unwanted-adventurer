// A bench's own rest-confirmation modal (a follow-up ask) — opened
// directly by WorldScene's bench-sprite click handler once the player's
// already confirmed to be within reach, same shape as bedModal.ts; Yes
// actually sits them down to rest, No (or the close button/clicking
// outside) just dismisses it.
import { myProfile, network, setMyProfile } from '../state.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';
import { benchModal, benchRestYesBtn, closeAllModals, updateInputCaptured } from './modalCore.js';

let pendingBench: { row: number; col: number } | null = null;

export function openBenchModal(row: number, col: number): void {
  closeAllModals();
  pendingBench = { row, col };
  benchModal.hidden = false;
  updateInputCaptured();
}

benchRestYesBtn.addEventListener('click', () => {
  if (!pendingBench) return;
  const { row, col } = pendingBench;
  network
    .restOnBench({ row, col })
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
      if (ack.ok && myProfile) {
        setMyProfile({ ...myProfile, restState: 'resting' });
        // A follow-up ask: "pop up a tooltip message on screen that they
        // are receiving enhanced regeneration while resting on the
        // bench" — the toast, distinct from the permanent combat-log
        // line above.
        showCenterToast('You are receiving enhanced regeneration while resting on the bench.');
      }
    })
    .catch(() => {
      /* nothing to show */
    })
    .finally(() => {
      pendingBench = null;
      closeAllModals();
    });
});
