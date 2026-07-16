// The Summoner's own "monster summons" picker (a later follow-up ask) —
// opened directly by clicking/hotkeying the skill (see WorldScene's
// useTargetedSkill), not an arm-then-click flow. Lists only the monster
// kinds myProfile.killedMonsterKinds already contains.
import { myProfile, network } from '../state.js';
import { closeAllModals, monsterSummonsModal, monsterSummonsList, updateInputCaptured } from './modalCore.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';

export function openMonsterSummonsModal(): void {
  closeAllModals();
  monsterSummonsList.innerHTML = '';

  const killed = myProfile?.killedMonsterKinds ?? [];

  if (killed.length === 0) {
    const li = document.createElement('li');
    li.textContent = "You haven't killed any monsters to summon yet.";
    monsterSummonsList.appendChild(li);
  } else {
    for (const kind of killed) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = kind;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        void network
          .castMonsterSummons(kind)
          .then((ack) => {
            if (ack.message) {
              showCenterToast(ack.message);
              logCombatMessage(ack.message);
            }
            if (ack.ok) monsterSummonsModal.hidden = true;
            else btn.disabled = false;
          })
          .catch(() => {
            btn.disabled = false;
          });
      });
      li.appendChild(btn);
      monsterSummonsList.appendChild(li);
    }
  }

  monsterSummonsModal.hidden = false;
  updateInputCaptured();
}
