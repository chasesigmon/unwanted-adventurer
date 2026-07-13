// A stationary NPC's own dialogue modal (a follow-up ask: the
// Headmistress's greeting + a "Quest: <title>" button beneath it) —
// generic over any future quest-giver, not Headmistress-specific.
import { myProfile, network, setMyProfile } from '../state.js';
import { QUESTS } from '../../shared/quests.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';
import { closeAllModals, npcDialogueActions, npcDialogueModal, npcDialogueName, npcDialogueText, updateInputCaptured } from './modalCore.js';

export function openNpcDialogueModal(name: string, message: string, questId?: string): void {
  closeAllModals();
  npcDialogueName.textContent = name;
  npcDialogueText.textContent = message;
  npcDialogueActions.innerHTML = '';

  if (questId) {
    const quest = QUESTS[questId];
    const alreadyStarted = Boolean(myProfile?.quests?.[questId]);
    if (quest && !alreadyStarted) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Quest: ${quest.title}`;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        void network
          .startQuest(questId)
          .then((ack) => {
            if (!ack.ok) {
              btn.disabled = false;
              if (ack.message) logCombatMessage(ack.message);
              return;
            }
            if (myProfile) setMyProfile({ ...myProfile, quests: { ...myProfile.quests, [questId]: [] } });
            if (ack.message) showCenterToast(ack.message);
            npcDialogueActions.innerHTML = '';
          })
          .catch(() => {
            btn.disabled = false;
          });
      });
      npcDialogueActions.appendChild(btn);
    }
  }

  npcDialogueModal.hidden = false;
  updateInputCaptured();
}
