// The recall spell's own modal (a later follow-up ask reworked this to a
// single settable recall point — "the player must set one location to be
// their recall choice at a time... in order to set the recall location
// the player must travel to the respective place... while there they use
// recall and... it should have the option to 'Set <name> as recall
// point'... they can update the recall point if they travel to Kortho
// for example"). Opened directly by clicking/hotkeying the recall skill
// (see WorldScene's useTargetedSkill), not an arm-then-click flow.
import { activeScene, myProfile, network } from '../state.js';
import { RECALL_POINTS, recallPointForMap, recallPointById } from '../../shared/recall.js';
import { closeAllModals, hideModal, recallModal, recallPoiList, updateInputCaptured } from './modalCore.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';

export function openRecallModal(): void {
  closeAllModals();
  recallPoiList.innerHTML = '';

  const hereAsRecallPoint = myProfile ? recallPointForMap(myProfile.map) : undefined;
  const currentPoint = myProfile?.recallPointId ? recallPointById(myProfile.recallPointId) : undefined;

  if (hereAsRecallPoint) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `Set ${hereAsRecallPoint.label} as recall point`;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void network
        .setRecallPoint()
        .then((ack) => {
          if (ack.message) {
            showCenterToast(ack.message);
            logCombatMessage(ack.message);
          }
          if (ack.ok) openRecallModal(); // refresh so the "Recall to X" option below updates too
          else btn.disabled = false;
        })
        .catch(() => {
          btn.disabled = false;
        });
    });
    li.appendChild(btn);
    recallPoiList.appendChild(li);
  }

  if (currentPoint) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `Recall to ${currentPoint.label}`;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void network
        .castRecall()
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
            // A later follow-up bug fix: "teachers and benches and
            // things didn't show up until I moved" — the room-wide
            // 'map:state' broadcast for the destination can arrive
            // before WorldScene's own 'sync' handler has updated
            // currentMap to match, so it gets silently dropped; this
            // ack's own mapState is guaranteed fresh and for the right
            // room (see CastSpellAck's own doc comment).
            if (ack.mapState) activeScene?.applyMapState(ack.mapState);
          } else btn.disabled = false;
        })
        .catch(() => {
          btn.disabled = false;
        });
    });
    li.appendChild(btn);
    recallPoiList.appendChild(li);
  }

  if (!hereAsRecallPoint && !currentPoint) {
    const li = document.createElement('li');
    const spots = RECALL_POINTS.map((p) => p.label).join(', ');
    li.textContent = `You haven't set a recall point yet. Travel to one of these places (${spots}) and set it as your recall point.`;
    recallPoiList.appendChild(li);
  }

  recallModal.hidden = false;
  updateInputCaptured();
}
