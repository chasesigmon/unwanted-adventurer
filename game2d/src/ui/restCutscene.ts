// Item 30's Inn "Stay and rest" service — a plain 2-second black
// cutscreen, no text. Closes whatever modal triggered it (the shop
// modal) first, same as every other full-screen moment in this project
// (the respawn overlay) that shouldn't sit behind an open modal.
import { closeAllModals } from './modalCore.js';

const REST_CUTSCENE_MS = 2000;

const overlay = document.getElementById('rest-overlay') as HTMLDivElement;

export function playRestCutscene(onComplete: () => void): void {
  closeAllModals();
  overlay.hidden = false;
  window.setTimeout(() => {
    overlay.hidden = true;
    onComplete();
  }, REST_CUTSCENE_MS);
}
