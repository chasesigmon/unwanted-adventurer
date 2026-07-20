// A Dorms bed's own sleep-confirmation modal (a later follow-up ask) —
// opened directly by WorldScene's bed-sprite click handler (there's no
// corner button/hotkey for it, same as the chest modal) once the player's
// already confirmed to be within reach; Yes actually puts them to sleep,
// No (or the close button/clicking outside) just dismisses it.
import { myProfile, network, setMyProfile } from '../state.js';
import { logCombatMessage } from './log.js';
import { bedModal, bedSleepYesBtn, closeAllModals, updateInputCaptured } from './modalCore.js';

let pendingBed: { row: number; col: number } | null = null;

export function openBedModal(row: number, col: number): void {
  closeAllModals();
  pendingBed = { row, col };
  bedModal.hidden = false;
  updateInputCaptured();
}

bedSleepYesBtn.addEventListener('click', () => {
  if (!pendingBed) return;
  const { row, col } = pendingBed;
  network
    .sleepInBed({ row, col })
    .then((ack) => {
      if (ack.message) logCombatMessage(ack.message);
      if (ack.ok && myProfile) {
        setMyProfile({ ...myProfile, restState: 'sleeping', sleepingInBed: true });
      }
    })
    .catch(() => {
      /* nothing to show */
    })
    .finally(() => {
      pendingBed = null;
      closeAllModals();
    });
});
