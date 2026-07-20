// The group panel — a player's own pet, plus (a later follow-up ask's
// animate dead spell) up to 1-2 animated monsters at once. Only ever
// shows the LOCAL player's own companions today (a real multi-player
// group is a future mechanic); WorldScene's own applyMapState calls
// updateGroupPanel with fresh data on every map:state, so this always
// reflects live server state rather than needing its own polling.
import { network } from '../state.js';
import { logCombatMessage } from './log.js';
import { repositionTargetPanel } from './targetPanel.js';
import {
  FOLLOWER_EQUIPMENT_SLOTS,
  type PetSnapshot,
  type AnimatedMonsterSnapshot,
  type TamedBeastSnapshot,
  type PetCommand,
  type FollowerEquipmentSlot,
} from '../../shared/pets.js';

const groupPanel = document.getElementById('group-panel') as HTMLDivElement;
const groupMembers = document.getElementById('group-members') as HTMLDivElement;
const groupPanelHandle = document.getElementById('group-panel-handle') as HTMLDivElement;

let sendingCommand = false;

// A later follow-up ask: "give the ability to reposition the group/
// follower window" — plain pointer-capture drag off the handle strip
// above (see its own CSS comment on why not the whole panel), clamped to
// stay fully on-screen. repositionTargetPanel() re-runs on every move
// since the target panel's own position is derived from wherever this
// panel currently sits (see targetPanel.ts).
let dragPointerId: number | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

groupPanelHandle.addEventListener('pointerdown', (e) => {
  dragPointerId = e.pointerId;
  const rect = groupPanel.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  groupPanelHandle.setPointerCapture(e.pointerId);
});

groupPanelHandle.addEventListener('pointermove', (e) => {
  if (dragPointerId !== e.pointerId) return;
  const maxLeft = window.innerWidth - groupPanel.offsetWidth;
  const maxTop = window.innerHeight - groupPanel.offsetHeight;
  const left = Math.min(Math.max(0, e.clientX - dragOffsetX), Math.max(0, maxLeft));
  const top = Math.min(Math.max(0, e.clientY - dragOffsetY), Math.max(0, maxTop));
  groupPanel.style.left = `${left}px`;
  groupPanel.style.top = `${top}px`;
  repositionTargetPanel();
});

groupPanelHandle.addEventListener('pointerup', (e) => {
  if (dragPointerId !== e.pointerId) return;
  groupPanelHandle.releasePointerCapture(e.pointerId);
  dragPointerId = null;
});

// A follower's own carried items + weapon/torso equipment (Phase C's
// "give/equip" ask) — followerId is undefined for a pet (one per owner,
// no id needed) and set for an animated monster (an owner can have more
// than one).
function buildFollowerItemsSection(
  followerKind: 'pet' | 'animatedMonster',
  followerId: string | undefined,
  inventory: string[],
  equipment: Partial<Record<FollowerEquipmentSlot, string>>,
  alive: boolean
): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'group-member-items';

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    if (sendingCommand) return;
    sendingCommand = true;
    action()
      .then((ack) => {
        if (!ack.ok && ack.message) logCombatMessage(ack.message);
      })
      .finally(() => {
        sendingCommand = false;
      });
  };

  // A follow-up ask: "pets should not be able to wear any equipment at
  // all, but they should be able to hold items. Only animated dead or
  // summoned followers should be allowed to wear equipment" — a real
  // pet's own equipment slots are always permanently empty and un-
  // fillable now (see game.gateway.ts's handleEquipFollowerItem), so
  // showing them here at all would just be dead UI. Skipped entirely for
  // a pet; unchanged for an animated monster.
  if (followerKind === 'animatedMonster') {
    for (const slot of FOLLOWER_EQUIPMENT_SLOTS) {
      const row = document.createElement('div');
      row.className = 'group-member-equip-row';
      const item = equipment[slot];
      const label = document.createElement('span');
      label.textContent = `${slot}: ${item ?? 'empty'}`;
      row.appendChild(label);
      if (item) {
        const unequipBtn = document.createElement('button');
        unequipBtn.type = 'button';
        unequipBtn.textContent = 'Unequip';
        unequipBtn.disabled = !alive;
        unequipBtn.addEventListener('click', () => run(() => network.unequipFollowerItem({ followerKind, followerId, slot })));
        row.appendChild(unequipBtn);
      }
      section.appendChild(row);
    }
  }

  if (inventory.length > 0) {
    const carriedLabel = document.createElement('div');
    carriedLabel.textContent = 'Carrying:';
    section.appendChild(carriedLabel);
    inventory.forEach((item, itemIndex) => {
      const row = document.createElement('div');
      row.className = 'group-member-item-row';
      const label = document.createElement('span');
      label.textContent = item;
      row.appendChild(label);
      // Only an animated monster can equip what it's holding — a pet can
      // only hold/carry (see this function's own doc comment above).
      if (followerKind === 'animatedMonster') {
        const equipBtn = document.createElement('button');
        equipBtn.type = 'button';
        equipBtn.textContent = 'Equip';
        equipBtn.disabled = !alive;
        equipBtn.addEventListener('click', () => run(() => network.equipFollowerItem({ followerKind, followerId, itemIndex })));
        row.appendChild(equipBtn);
      }
      const takeBtn = document.createElement('button');
      takeBtn.type = 'button';
      takeBtn.textContent = 'Take';
      takeBtn.disabled = !alive;
      takeBtn.addEventListener('click', () => run(() => network.takeFollowerItem({ followerKind, followerId, itemIndex })));
      row.appendChild(takeBtn);
      section.appendChild(row);
    });
  }

  return section;
}

function buildMemberCard(
  name: string,
  hp: number,
  maxHp: number,
  alive: boolean,
  command: PetCommand,
  expText: string | undefined,
  onCommand: (command: PetCommand) => void,
  itemsSection: HTMLDivElement,
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
  card.appendChild(itemsSection);

  return card;
}

// Tracks the player's own current followers (a later follow-up ask moved
// the "give item" picker out of this panel and into the inventory
// modal, see inventoryEquipment.ts's giveItemToFollower) — this is
// already the freshest copy of that data anywhere on the client, updated
// on every map:state, so the inventory modal just reads it rather than
// WorldScene needing its own separate public getter for the same thing.
let currentPet: PetSnapshot | null = null;
let currentAnimatedMonsters: AnimatedMonsterSnapshot[] = [];
let currentTamedBeast: TamedBeastSnapshot | null = null;

export function getFollowers(): { pet: PetSnapshot | null; animatedMonsters: AnimatedMonsterSnapshot[] } {
  return { pet: currentPet, animatedMonsters: currentAnimatedMonsters };
}

// An empty placeholder — the Druid's own Tame Beast has no give/equip UI
// (not asked for), unlike a real pet/animated monster's own
// buildFollowerItemsSection.
function emptyItemsSection(): HTMLDivElement {
  return document.createElement('div');
}

export function updateGroupPanel(
  pet: PetSnapshot | null,
  animatedMonsters: AnimatedMonsterSnapshot[] = [],
  tamedBeast: TamedBeastSnapshot | null = null
): void {
  currentPet = pet;
  currentAnimatedMonsters = animatedMonsters;
  currentTamedBeast = tamedBeast;
  if (!pet && animatedMonsters.length === 0 && !tamedBeast) {
    groupPanel.hidden = true;
    groupMembers.innerHTML = '';
    repositionTargetPanel();
    return;
  }
  groupPanel.hidden = false;
  groupMembers.innerHTML = '';

  if (pet) {
    groupMembers.appendChild(
      buildMemberCard(
        `${pet.name} (Lv ${pet.level})`,
        pet.hp,
        pet.maxHp,
        pet.alive,
        pet.command,
        `Exp ${pet.exp}`,
        (command) =>
          network.petCommand(command).then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
            else if (ack.ok && ack.pet) updateGroupPanel(ack.pet, animatedMonsters, currentTamedBeast);
          }),
        buildFollowerItemsSection('pet', undefined, pet.inventory, pet.equipment, pet.alive)
      )
    );
  }

  if (tamedBeast) {
    groupMembers.appendChild(
      buildMemberCard(
        `${tamedBeast.name} (Lv ${tamedBeast.level})`,
        tamedBeast.hp,
        tamedBeast.maxHp,
        true,
        tamedBeast.command,
        undefined,
        (command) =>
          network.tamedBeastCommand(command).then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
          }),
        emptyItemsSection(),
        () =>
          network.removeTamedBeast().then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
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
        buildFollowerItemsSection('animatedMonster', am.id, am.inventory, am.equipment, am.alive),
        () =>
          network.removeAnimatedMonster(am.id).then((ack) => {
            if (!ack.ok && ack.message) logCombatMessage(ack.message);
          })
      )
    );
  }
  // A follow-up bug fix: "labels are still overlapping" — the target
  // panel's own position depends on how tall THIS panel just rendered
  // (see targetPanel.ts's own repositionTargetPanel), so every content
  // change here needs to re-trigger it, not just target updates.
  repositionTargetPanel();
}
