// The quest log modal (a follow-up ask) — a list of started quest
// titles; clicking one swaps this same body to a detail view (the
// quest's own description plus its objective checklist, completed
// objectives struck through, with live progress counts for
// killMonster/haveItem objectives) instead of opening a second modal,
// same "one body, swap what's rendered into it" shape as mapModal's own
// tabs.
import { myProfile } from '../state.js';
import { QUESTS, isObjectiveDone, objectiveCurrentCount, allObjectivesDone, type QuestObjective, type QuestProgress } from '../../shared/quests.js';
import { questLogBody, questLogModal, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

// Purely for the "return to <name>" reminder below — every quest-giver
// this project has today, keyed by their own quest id (see
// server/worlds/teachers.ts).
const QUEST_GIVER_NAMES: Record<string, string> = {
  'learn-spells': 'Headmistress Elowen',
  'kill-imps': 'Professor Bramwell',
  'gather-mana-crystals': 'Professor Thistlewood',
  'find-the-map': 'Professor Hollowell',
  'choose-house': 'Professor Hollowell',
};

// hasFlag objectives (a follow-up ask's "acquire the map" quest, and its
// "choose a house" follow-up) check PlayerSnapshot.mapUnlocked/house —
// bundled the same way everywhere this module calls into
// isObjectiveDone/allObjectivesDone.
function flagsFor(): { mapUnlocked: boolean | undefined; houseChosen: boolean } {
  return { mapUnlocked: myProfile?.mapUnlocked, houseChosen: Boolean(myProfile?.house) };
}

// Reset to the list view every time the modal is freshly opened (mapModal's
// own "always resets back to the current-world tab" convention) — null
// means "show the list," a quest id means "show that quest's detail."
let selectedQuestId: string | null = null;

function objectiveCountsFor(objective: QuestObjective, progress: QuestProgress): string {
  if (objective.kind === 'learnSkill' || objective.kind === 'hasFlag') return '';
  const current = objectiveCurrentCount(objective, progress, myProfile?.inventory ?? []);
  return ` (${Math.min(current, objective.count ?? 1)}/${objective.count ?? 1})`;
}

function renderQuestList(): void {
  questLogBody.innerHTML = '';
  const questIds = Object.keys(myProfile?.quests ?? {});
  if (questIds.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inventory-empty';
    empty.textContent = 'No active quests.';
    questLogBody.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'inventory-list';
  for (const questId of questIds) {
    const quest = QUESTS[questId];
    const progress = myProfile?.quests?.[questId];
    if (!quest || !progress) continue;
    const li = document.createElement('li');
    li.className = 'inventory-item';
    const done = quest.objectives.filter((o) => isObjectiveDone(o, progress, myProfile?.skills ?? {}, myProfile?.inventory ?? [], flagsFor())).length;
    const status = progress.completedAt ? ' — Completed' : '';
    li.textContent = `${quest.title} (${done}/${quest.objectives.length})${status}`;
    li.addEventListener('click', () => {
      selectedQuestId = questId;
      renderQuestLog();
    });
    list.appendChild(li);
  }
  questLogBody.appendChild(list);
}

function renderQuestDetail(questId: string): void {
  const quest = QUESTS[questId];
  const progress = myProfile?.quests?.[questId];
  if (!quest || !progress) {
    selectedQuestId = null;
    renderQuestList();
    return;
  }
  questLogBody.innerHTML = '';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'quest-back-btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', () => {
    selectedQuestId = null;
    renderQuestLog();
  });
  questLogBody.appendChild(backBtn);

  const title = document.createElement('h3');
  title.textContent = quest.title;
  questLogBody.appendChild(title);

  const description = document.createElement('p');
  description.className = 'quest-description';
  description.textContent = quest.description;
  questLogBody.appendChild(description);

  const list = document.createElement('ul');
  list.className = 'quest-objective-list';
  for (const objective of quest.objectives) {
    const li = document.createElement('li');
    const isDone = isObjectiveDone(objective, progress, myProfile?.skills ?? {}, myProfile?.inventory ?? [], flagsFor());
    li.textContent = `${objective.label}${objectiveCountsFor(objective, progress)}`;
    li.className = isDone ? 'quest-objective-done' : 'quest-objective-pending';
    list.appendChild(li);
  }
  questLogBody.appendChild(list);

  // A follow-up ask: "add a message in the quest log... to return to
  // [the quest-giver] once they have finished the quest."
  const note = document.createElement('p');
  note.className = 'quest-description';
  if (progress.completedAt) {
    note.textContent = 'Quest completed!';
  } else if (allObjectivesDone(quest, progress, myProfile?.skills ?? {}, myProfile?.inventory ?? [], flagsFor())) {
    note.textContent = `Return to ${QUEST_GIVER_NAMES[questId] ?? 'the quest giver'} to complete this quest.`;
  }
  if (note.textContent) questLogBody.appendChild(note);
}

function renderQuestLog(): void {
  if (selectedQuestId) renderQuestDetail(selectedQuestId);
  else renderQuestList();
}

export function openQuestLog(): void {
  selectedQuestId = null;
  renderQuestLog();
}

registerModalOpenHandler(questLogModal, openQuestLog);
registerModalRefreshHandler(questLogModal, renderQuestLog);
