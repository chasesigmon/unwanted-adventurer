// The action bar (2x10 slots) — a skill icon from the Skills modal can be
// dragged (or double-clicked) into any slot; a filled slot is then
// clickable, using that skill on the currently selected target — see
// WorldScene.useTargetedSkill, the single place that interprets what each
// skill name actually does.
import { activeScene, myProfile } from '../state.js';
import { createCooldownOverlay, isAttackSkill, skillIconColor, updateCooldownOverlay } from './skillMeta.js';
import { skillIconGlyphUrl } from './skillIcons.js';
import { attachTooltip } from './tooltip.js';

export const ACTION_BAR_SLOT_COUNT = 20;
const actionBar = document.getElementById('action-bar') as HTMLDivElement;
const actionBarToggle = document.getElementById('action-bar-toggle') as HTMLButtonElement;
const actionSlots: HTMLDivElement[] = [];
export const actionBarSkills: Array<string | null> = new Array(ACTION_BAR_SLOT_COUNT).fill(null);

// Collapsible (a follow-up ask) — persisted per-username in localStorage,
// same convention as the loadout itself.
function actionBarCollapsedStorageKey(username: string): string {
  return `game2d:actionBarCollapsed:${username}`;
}

function setActionBarCollapsed(collapsed: boolean): void {
  actionBar.classList.toggle('collapsed', collapsed);
  actionBarToggle.textContent = collapsed ? '▴' : '▾';
  actionBarToggle.title = collapsed ? 'Expand action bar' : 'Collapse action bar';
}

actionBarToggle.addEventListener('click', () => {
  const collapsed = !actionBar.classList.contains('collapsed');
  setActionBarCollapsed(collapsed);
  if (myProfile) {
    try {
      localStorage.setItem(actionBarCollapsedStorageKey(myProfile.username), String(collapsed));
    } catch {
      /* localStorage unavailable (private browsing etc.) — not worth surfacing */
    }
  }
});

function renderActionSlot(index: number): void {
  // Always called with an index this same module just created below, so
  // the slot is guaranteed to exist.
  const slot = actionSlots[index]!;
  const skillName = actionBarSkills[index];
  slot.classList.toggle('filled', skillName !== null);
  slot.draggable = skillName !== null;
  const overlay = slot.querySelector<HTMLElement>('.cooldown-overlay')!;
  if (skillName) {
    slot.textContent = '';
    slot.appendChild(overlay); // textContent= above wipes children too — re-append
    slot.style.background = skillIconColor(skillName);
    slot.style.backgroundImage = skillIconGlyphUrl(skillName);
    slot.style.backgroundSize = '60%';
    slot.style.backgroundRepeat = 'no-repeat';
    slot.style.backgroundPosition = 'center';
    overlay.dataset.skill = skillName;
  } else {
    slot.textContent = '';
    slot.appendChild(overlay);
    slot.style.background = '';
    slot.style.backgroundImage = '';
    delete overlay.dataset.skill;
  }
  updateCooldownOverlay(overlay);
}

// Persisted per-username in localStorage so a slotted loadout survives a
// reload/reconnect — purely a client-side convenience, the server has no
// idea the action bar exists at all.
function actionBarStorageKey(username: string): string {
  return `game2d:actionBar:${username}`;
}

export function saveActionBar(): void {
  if (!myProfile) return;
  try {
    localStorage.setItem(actionBarStorageKey(myProfile.username), JSON.stringify(actionBarSkills));
  } catch {
    /* localStorage unavailable (private browsing etc.) — not worth surfacing */
  }
}

let actionBarLoadedForUsername: string | null = null;
export function loadActionBarOnce(username: string): void {
  if (actionBarLoadedForUsername === username) return;
  actionBarLoadedForUsername = username;
  try {
    setActionBarCollapsed(localStorage.getItem(actionBarCollapsedStorageKey(username)) === 'true');
  } catch {
    /* localStorage unavailable — leave it expanded */
  }
  try {
    const raw = localStorage.getItem(actionBarStorageKey(username));
    if (!raw) return;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return;
    for (let i = 0; i < ACTION_BAR_SLOT_COUNT; i++) {
      const skillName = saved[i];
      actionBarSkills[i] = typeof skillName === 'string' ? skillName : null;
      renderActionSlot(i);
    }
  } catch {
    /* corrupt/missing data — just leave the bar empty */
  }
}

// Custom MIME type carrying which action-bar slot a drag started from
// (if any) — set only when dragging FROM a slot (see the dragstart
// handler below), never when dragging from the Skills modal — so the
// drop handler can tell "rearranging within the bar" (clear the source
// slot too) apart from "dragging a fresh copy in from the modal".
const ACTION_SLOT_SOURCE_MIME = 'application/x-action-slot-index';

export function assignActionSlot(index: number, skillName: string): void {
  // Punch and dagger share one "Attack" slot — dropping either one bumps
  // whichever OTHER slot currently holds the other, rather than allowing
  // two at once.
  if (isAttackSkill(skillName)) {
    for (let j = 0; j < ACTION_BAR_SLOT_COUNT; j++) {
      if (j !== index && actionBarSkills[j] !== null && isAttackSkill(actionBarSkills[j]!)) {
        actionBarSkills[j] = null;
        renderActionSlot(j);
      }
    }
  }
  actionBarSkills[index] = skillName;
  renderActionSlot(index);
}

for (let i = 0; i < ACTION_BAR_SLOT_COUNT; i++) {
  const slot = document.createElement('div');
  slot.className = 'action-slot';
  slot.dataset.slotIndex = String(i);
  slot.appendChild(createCooldownOverlay(''));
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    const skillName = e.dataTransfer?.getData('text/plain');
    if (!skillName) return;
    const sourceIndexRaw = e.dataTransfer?.getData(ACTION_SLOT_SOURCE_MIME);
    const sourceIndex = sourceIndexRaw ? Number(sourceIndexRaw) : null;
    // A follow-up ask: dropping one filled slot onto another filled slot
    // should SWAP them, not silently delete whatever was already sitting
    // in the destination — captured before assignActionSlot below
    // overwrites it.
    const previousInDest = actionBarSkills[i];

    assignActionSlot(i, skillName);
    // Dragging in from ANOTHER slot is a move, not a copy — clear
    // wherever it came from (unless dropped back onto itself), putting
    // whatever WAS in the destination slot there instead of just
    // discarding it.
    if (sourceIndex !== null && sourceIndex !== i && actionBarSkills[sourceIndex] === skillName) {
      if (previousInDest && previousInDest !== skillName) {
        assignActionSlot(sourceIndex, previousInDest);
      } else {
        actionBarSkills[sourceIndex] = null;
        renderActionSlot(sourceIndex);
      }
    }
    saveActionBar();
  });
  // A filled slot is itself draggable — dropped anywhere that doesn't
  // accept it (dropEffect stays 'none'), that's how you remove it from
  // the bar entirely.
  slot.addEventListener('dragstart', (e) => {
    const skillName = actionBarSkills[i];
    if (!skillName) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', skillName);
    e.dataTransfer?.setData(ACTION_SLOT_SOURCE_MIME, String(i));
  });
  slot.addEventListener('dragend', (e) => {
    if (e.dataTransfer?.dropEffect === 'none' && actionBarSkills[i] !== null) {
      actionBarSkills[i] = null;
      renderActionSlot(i);
      saveActionBar();
    }
  });
  slot.addEventListener('click', () => {
    const skillName = actionBarSkills[i];
    if (skillName) activeScene?.useTargetedSkill(skillName);
  });
  // A follow-up ask: "little black tooltips with the spell name" on
  // hover — same custom tooltip component the Skills modal's own name
  // hover already uses, just showing the bare skill name here (attached
  // once per slot, re-reading actionBarSkills[i] fresh on every hover so
  // it stays accurate as the slot gets filled/emptied/dragged around).
  attachTooltip(slot, () => actionBarSkills[i] ?? undefined);
  actionBar.appendChild(slot);
  actionSlots.push(slot);
}
