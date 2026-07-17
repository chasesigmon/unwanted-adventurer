// The recall spell's own destination picker (a later follow-up ask) —
// opened directly by clicking/hotkeying the recall skill (see
// WorldScene's useTargetedSkill), not an arm-then-click flow like murus
// lapideus/animate dead. Lists only the points of interest
// myProfile.visitedPois already contains.
import { myProfile, network } from '../state.js';
import { RECALL_POINTS } from '../../shared/recall.js';
import { closeAllModals, hideModal, recallModal, recallPoiList, updateInputCaptured } from './modalCore.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';

export function openRecallModal(): void {
  closeAllModals();
  recallPoiList.innerHTML = '';

  const visited = new Set(myProfile?.visitedPois ?? []);
  const available = RECALL_POINTS.filter((p) => visited.has(p.id));

  if (available.length === 0) {
    const li = document.createElement('li');
    li.textContent = "You haven't visited anywhere to recall to yet.";
    recallPoiList.appendChild(li);
  } else {
    for (const point of available) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = point.label;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        void network
          .castRecall(point.id)
          .then((ack) => {
            if (ack.message) {
              showCenterToast(ack.message);
              logCombatMessage(ack.message);
            }
            if (ack.ok) {
              // Same class of bug as monsterSummonsModal's own fix (a
              // later follow-up ask) — setting `.hidden` directly instead
              // of going through hideModal + updateInputCaptured leaves
              // isInputCaptured() stuck true. A successful recall's own
              // map transition happens to paper over it here (WorldScene's
              // closeAllModals on map change recomputes it moments later),
              // but there's no reason to rely on that coincidence.
              hideModal(recallModal);
              updateInputCaptured();
            } else btn.disabled = false;
          })
          .catch(() => {
            btn.disabled = false;
          });
      });
      li.appendChild(btn);
      recallPoiList.appendChild(li);
    }
  }

  recallModal.hidden = false;
  updateInputCaptured();
}
