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
import { HOUSE_NAMES, SPECIALIZATION_PATHS, SPECIALIZATION_LEVEL_REQUIREMENT } from '../../shared/constants.js';
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
// level 10" below that, "choose your path as a mage" at/above it, with
// the 6 paths as clickable buttons (a later follow-up ask — "mechanics
// on the paths will come in the future", so choosing one just records
// it). Already-chosen is permanent (see game.gateway.ts's
// handleChooseSpecialization) — clicking again just repeats a fixed line.
export function openSpecializationDialogue(name: string): void {
  closeAllModals();
  npcDialogueName.textContent = name;
  npcDialogueActions.innerHTML = '';

  if ((myProfile?.level ?? 0) < SPECIALIZATION_LEVEL_REQUIREMENT) {
    npcDialogueText.textContent = `Return to me when you are level ${SPECIALIZATION_LEVEL_REQUIREMENT}.`;
  } else if (myProfile?.specialization) {
    npcDialogueText.textContent = 'Your path has been chosen, may you make it your own.';
  } else {
    npcDialogueText.textContent = 'It is time to choose your path as a mage. Please make your selection from the choices below:';
    for (const path of SPECIALIZATION_PATHS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = path.charAt(0).toUpperCase() + path.slice(1);
      btn.addEventListener('click', () => {
        for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = true;
        void network
          .chooseSpecialization(path)
          .then((ack) => {
            if (!ack.ok) {
              for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = false;
              if (ack.message) logCombatMessage(ack.message);
              return;
            }
            if (myProfile) setMyProfile({ ...myProfile, specialization: path });
            if (ack.message) showCenterToast(ack.message);
            npcDialogueText.textContent = 'Your path has been chosen, may you make it your own.';
            npcDialogueActions.innerHTML = '';
          })
          .catch(() => {
            for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = false;
          });
      });
      npcDialogueActions.appendChild(btn);
    }
  }

  npcDialogueModal.hidden = false;
  updateInputCaptured();
}

// The Entrance Hall's own house-assignment teacher (a follow-up ask) —
// no quest, just a one-time choice: 4 house buttons if unset, a fixed
// "already chosen" line (no buttons) once it's permanent.
export function openHouseChoiceDialogue(name: string): void {
  closeAllModals();
  npcDialogueName.textContent = name;
  npcDialogueActions.innerHTML = '';

  if (myProfile?.house) {
    npcDialogueText.textContent = 'You have chosen your house already. Let glory and fame be yours!';
  } else {
    npcDialogueText.textContent = 'Please choose your desired house:';
    for (const house of HOUSE_NAMES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = house;
      btn.addEventListener('click', () => {
        for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = true;
        void network
          .chooseHouse(house)
          .then((ack) => {
            if (!ack.ok) {
              for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = false;
              if (ack.message) logCombatMessage(ack.message);
              return;
            }
            if (myProfile) setMyProfile({ ...myProfile, house });
            if (ack.message) showCenterToast(ack.message);
            npcDialogueText.textContent = 'You have chosen your house already. Let glory and fame be yours!';
            npcDialogueActions.innerHTML = '';
          })
          .catch(() => {
            for (const b of Array.from(npcDialogueActions.children)) (b as HTMLButtonElement).disabled = false;
          });
      });
      npcDialogueActions.appendChild(btn);
    }
  }

  npcDialogueModal.hidden = false;
  updateInputCaptured();
}
