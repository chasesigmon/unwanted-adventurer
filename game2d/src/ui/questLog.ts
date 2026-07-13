// The quest log modal (a follow-up ask) — a list of started quest
// titles; clicking one swaps this same body to a detail view (the
// quest's own description plus its objective checklist, completed
// objectives struck through) instead of opening a second modal, same
// "one body, swap what's rendered into it" shape as mapModal's own tabs.
import { myProfile } from '../state.js';
import { QUESTS } from '../../shared/quests.js';
import { questLogBody, questLogModal, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

// Reset to the list view every time the modal is freshly opened (mapModal's
// own "always resets back to the current-world tab" convention) — null
// means "show the list," a quest id means "show that quest's detail."
let selectedQuestId: string | null = null;

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
    if (!quest) continue;
    const li = document.createElement('li');
    li.className = 'inventory-item';
    const progress = myProfile?.quests?.[questId] ?? [];
    const done = quest.objectives.filter((o) => progress.includes(o.id)).length;
    li.textContent = `${quest.title} (${done}/${quest.objectives.length})`;
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
  if (!quest || !myProfile?.quests?.[questId]) {
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

  const progress = myProfile?.quests?.[questId] ?? [];
  const list = document.createElement('ul');
  list.className = 'quest-objective-list';
  for (const objective of quest.objectives) {
    const li = document.createElement('li');
    const isDone = progress.includes(objective.id);
    li.textContent = objective.label;
    li.className = isDone ? 'quest-objective-done' : 'quest-objective-pending';
    list.appendChild(li);
  }
  questLogBody.appendChild(list);
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
