// A stationary quest-giver's own dialogue modal — generic over any
// quest-giver (the Headmistress and the two follow-up-ask teachers
// flanking her), not hardcoded to one. Shows a different line + button
// depending on the player's own progress: the opening greeting with a
// "Quest: <title>" button (not started), the same greeting with no
// button (started, still working on it), the quest's own "ready" line
// with a "Complete Quest" button (every objective done, not yet turned
// in), or its "completed" line with no button (already turned in).
import { myProfile, network, setMyProfile } from '../state.js';
import { QUESTS, allObjectivesDone } from '../../shared/quests.js';
import { logCombatMessage } from './log.js';
import { showCenterToast } from './toast.js';
import { closeAllModals, npcDialogueActions, npcDialogueModal, npcDialogueName, npcDialogueText, updateInputCaptured } from './modalCore.js';

export function openNpcDialogueModal(name: string, questId: string): void {
  const quest = QUESTS[questId];
  if (!quest) return;

  closeAllModals();
  npcDialogueName.textContent = name;
  npcDialogueActions.innerHTML = '';

  const progress = myProfile?.quests?.[questId];

  if (!progress) {
    npcDialogueText.textContent = quest.description;
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
          if (myProfile) setMyProfile({ ...myProfile, quests: { ...myProfile.quests, [questId]: {} } });
          if (ack.message) showCenterToast(ack.message);
          npcDialogueActions.innerHTML = '';
        })
        .catch(() => {
          btn.disabled = false;
        });
    });
    npcDialogueActions.appendChild(btn);
  } else if (progress.completedAt) {
    npcDialogueText.textContent = quest.completedMessage;
  } else if (allObjectivesDone(quest, progress, myProfile?.skills ?? {}, myProfile?.inventory ?? [], { mapUnlocked: myProfile?.mapUnlocked })) {
    npcDialogueText.textContent = quest.readyMessage;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Complete Quest';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void network
        .completeQuest(questId)
        .then((ack) => {
          if (!ack.ok) {
            btn.disabled = false;
            if (ack.message) logCombatMessage(ack.message);
            return;
          }
          if (ack.message) showCenterToast(ack.message);
          npcDialogueText.textContent = quest.completedMessage;
          npcDialogueActions.innerHTML = '';
        })
        .catch(() => {
          btn.disabled = false;
        });
    });
    npcDialogueActions.appendChild(btn);
  } else {
    npcDialogueText.textContent = quest.description;
  }

  npcDialogueModal.hidden = false;
  updateInputCaptured();
}

// The Specialization room's own teacher (a follow-up ask) — no quest at
// all, just a live level check every time: "Return to me when you are
// level 10" below that, "choose your path as a mage" (choices TBD, no
// button yet) at/above it.
const SPECIALIZATION_LEVEL_REQUIREMENT = 10;

export function openSpecializationDialogue(name: string): void {
  closeAllModals();
  npcDialogueName.textContent = name;
  npcDialogueActions.innerHTML = '';
  npcDialogueText.textContent =
    (myProfile?.level ?? 0) >= SPECIALIZATION_LEVEL_REQUIREMENT
      ? 'It is time to choose your path as a mage. Please make your selection from the choices below:'
      : `Return to me when you are level ${SPECIALIZATION_LEVEL_REQUIREMENT}.`;
  npcDialogueModal.hidden = false;
  updateInputCaptured();
}
