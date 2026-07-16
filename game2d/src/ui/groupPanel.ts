// The group panel — a player's own pet, plus (a later follow-up ask's
// animate dead spell) up to 1-2 animated monsters at once. Only ever
// shows the LOCAL player's own companions today (a real multi-player
// group is a future mechanic); WorldScene's own applyMapState calls
// updateGroupPanel with fresh data on every map:state, so this always
// reflects live server state rather than needing its own polling.
import { network } from '../state.js';
import { logCombatMessage } from './log.js';
import type { PetSnapshot, AnimatedMonsterSnapshot, PetCommand } from '../../shared/pets.js';

const groupPanel = document.getElementById('group-panel') as HTMLDivElement;
const groupMembers = document.getElementById('group-members') as HTMLDivElement;

let sendingCommand = false;

function buildMemberCard(
  name: string,
  hp: number,
  maxHp: number,
  alive: boolean,
  command: PetCommand,
  expText: string | undefined,
  onCommand: (command: PetCommand) => void,
  onRemove?: () => void
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'group-member';

  const nameEl = document.createElement('div');
  nameEl.className = 'group-member-name';
  nameEl.textContent = alive ? name : `${name} — fallen`;
  card.appendChild(nameEl);

  const hpBar = document.createElement('div');
  hpBar.className = 'group-member-hp-bar';
  const hpFill = document.createElement('div');
  hpFill.className = 'group-member-hp-fill';
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  hpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  hpBar.appendChild(hpFill);
  card.appendChild(hpBar);

  if (expText !== undefined) {
    const expEl = document.createElement('div');
    expEl.className = 'group-member-exp';
    expEl.textContent = expText;
    card.appendChild(expEl);
  }

  const commandsEl = document.createElement('div');
  commandsEl.className = 'group-member-commands';
  const commands: Array<{ command: PetCommand; label: string }> = [
    { command: 'follow', label: 'Follow' },
    { command: 'stay', label: 'Stay' },
    { command: 'sleep', label: 'Sleep' },
    { command: 'attack', label: 'Attack' },
  ];
  for (const { command: c, label } of commands) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.classList.toggle('active', c === command);
    btn.disabled = !alive;
    btn.addEventListener('click', () => {
      if (sendingCommand) return;
      sendingCommand = true;
      Promise.resolve(onCommand(c)).finally(() => {
        sendingCommand = false;
      });
    });
    commandsEl.appendChild(btn);
  }
  // "An option... to 'remove' and get rid of" (a later follow-up ask) —
  // animated monsters only (animate dead/monster summons/demon imp/the
  // Illusionist's duplicate); a real purchased pet is never removable
  // this way, so onRemove is simply absent for a pet's own card.
  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = !alive;
    removeBtn.addEventListener('click', () => {
      if (sendingCommand) return;
      sendingCommand = true;
      Promise.resolve(onRemove()).finally(() => {
        sendingCommand = false;
      });
    });
    commandsEl.appendChild(removeBtn);
  }
  card.appendChild(commandsEl);

  return card;
}

export function updateGroupPanel(pet: PetSnapshot | null, animatedMonsters: AnimatedMonsterSnapshot[] = []): void {
  if (!pet && animatedMonsters.length === 0) {
    groupPanel.hidden = true;
    groupMembers.innerHTML = '';
    return;
  }
  groupPanel.hidden = false;
  groupMembers.innerHTML = '';

  if (pet) {
    groupMembers.appendChild(
      buildMemberCard(`${pet.name} (Lv ${pet.level})`, pet.hp, pet.maxHp, pet.alive, pet.command, `Exp ${pet.exp}`, (command) =>
        network.petCommand(command).then((ack) => {
          if (!ack.ok && ack.message) logCombatMessage(ack.message);
          else if (ack.ok && ack.pet) updateGroupPanel(ack.pet, animatedMonsters);
        })
      )
    );
  }

  for (const am of animatedMonsters) {
    groupMembers.appendChild(
      buildMemberCard(
        am.name,
        am.hp,
        am.maxHp,
        am.alive,
        am.command,
        undefined,
        (command) =>
          network.animatedMonsterCommand(am.id, command).then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
          }),
        () =>
          network.removeAnimatedMonster(am.id).then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
          })
      )
    );
  }
}
