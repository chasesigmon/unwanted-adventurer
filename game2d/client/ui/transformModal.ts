// Item 11's Transform spell picker — opened directly by clicking/
// hotkeying the skill (see WorldScene's useTargetedSkill), not an
// arm-then-click flow. Lists only the beast kinds myProfile's own
// tamedBeastKinds already contains — same shape as monsterSummonsModal.ts.
import { myProfile, network } from '../state.js';
import { closeAllModals, hideModal, transformModal, transformList, updateInputCaptured } from './modalCore.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';

export function openTransformModal(): void {
  closeAllModals();
  transformList.innerHTML = '';

  const tamed = myProfile?.tamedBeastKinds ?? [];

  if (tamed.length === 0) {
    const li = document.createElement('li');
    li.textContent = "You haven't tamed any beasts to transform into yet.";
    transformList.appendChild(li);
  } else {
    for (const kind of tamed) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = kind;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        void network
          .castTransform(kind)
          .then((ack) => {
            if (ack.message) {
              showCenterToast(ack.message);
              logCombatMessage(ack.message);
            }
            if (ack.ok) {
              // Same "hideModal + updateInputCaptured, not a bare
              // .hidden=true" fix monsterSummonsModal.ts's own doc
              // comment explains — leaving that out once left
              // click-to-target stuck blocked after this modal closed.
              hideModal(transformModal);
              updateInputCaptured();
            } else btn.disabled = false;
          })
          .catch(() => {
            btn.disabled = false;
          });
      });
      li.appendChild(btn);
      transformList.appendChild(li);
    }
  }

  transformModal.hidden = false;
  updateInputCaptured();
}
