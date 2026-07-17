// The Skills modal — every skill the character has learned.
import { myProfile } from '../state.js';
import { attachTooltip } from './tooltip.js';
import { SKILL_DESCRIPTIONS, SKILL_CATEGORIES, skillCategory, createCooldownOverlay, isAttackSkill, isUsableSkill, skillIconColor } from './skillMeta.js';
import { skillIconGlyphUrl } from './skillIcons.js';
import { actionBarSkills, assignActionSlot, beginDragVisual, endDragVisual, removeFromActionBar, saveActionBar, updateDragVisual } from './actionBar.js';
import { logCombatMessage } from './log.js';
import { registerModalOpenHandler, registerModalRefreshHandler, skillsBody, skillsModal } from './modalCore.js';

// A skill row with a small icon to the left of its name — built by hand
// rather than reusing appendStatRow, since a usable skill's icon also
// needs to be draggable into the action bar.
function renderSkillRow(skillName: string, valueText: string): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label skill-label';

  const icon = document.createElement('span');
  icon.className = 'skill-icon';
  icon.style.background = skillIconColor(skillName);
  icon.style.backgroundImage = skillIconGlyphUrl(skillName);
  icon.style.backgroundSize = '65%';
  icon.style.backgroundRepeat = 'no-repeat';
  icon.style.backgroundPosition = 'center';

  const usable = isUsableSkill(skillName);
  if (usable) {
    icon.draggable = true;
    icon.classList.add('draggable');
    attachTooltip(icon, () => 'Drag to the action bar (or double-click) to use on your selected target — shift-click to pull it back off');
    icon.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', skillName);
      beginDragVisual(e, icon);
    });
    icon.addEventListener('drag', updateDragVisual);
    icon.addEventListener('dragend', endDragVisual);
    icon.addEventListener('click', (e) => {
      // A later follow-up ask: "shift-click a skill to quick-unassign it
      // from the action bar" — complements double-click's own
      // quick-assign below, no need to open the action bar and drag it
      // off by hand.
      if (!e.shiftKey) return;
      if (!removeFromActionBar(skillName)) {
        logCombatMessage(`${skillName} isn't on your action bar.`);
      }
    });
    // Double-click drops it straight into the next free action-bar slot
    // — the same singleton-attack-slot rule the drag-and-drop path uses
    // applies here too (see assignActionSlot). Also refuses to add a
    // second copy of a skill (or a second attack-type skill) that's
    // already slotted somewhere, instead of stacking a duplicate icon
    // into the next free slot every time it's double-clicked (item 3).
    icon.addEventListener('dblclick', () => {
      const existingIndex = actionBarSkills.findIndex(
        (s) => s === skillName || (isAttackSkill(skillName) && s !== null && isAttackSkill(s))
      );
      if (existingIndex !== -1) return;
      const freeIndex = actionBarSkills.findIndex((s) => s === null);
      if (freeIndex === -1) {
        logCombatMessage('Your action bar is full.');
        return;
      }
      assignActionSlot(freeIndex, skillName);
      saveActionBar();
    });
  }
  icon.appendChild(createCooldownOverlay(skillName));

  const nameSpan = document.createElement('span');
  nameSpan.textContent = skillName;
  // Hovering the NAME (not the drag-handle icon) shows a description
  // tooltip — `cursor: help` signals "more info here" distinctly from
  // the icon's own grab/default cursor.
  attachTooltip(nameSpan, () => SKILL_DESCRIPTIONS[skillName]);
  nameSpan.style.cursor = 'help';

  labelEl.appendChild(icon);
  labelEl.appendChild(nameSpan);

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = valueText;

  skillsBody.appendChild(labelEl);
  skillsBody.appendChild(valueEl);
}

// A category header spanning both grid columns (a follow-up ask:
// "separate each skill by category") — plain text, no icon/value, so it
// reads as a section break rather than another row.
function renderCategoryHeader(category: string): void {
  const header = document.createElement('div');
  header.className = 'skill-category-header';
  header.textContent = category;
  skillsBody.appendChild(header);
}

export function renderSkills(): void {
  if (!myProfile) return;
  skillsBody.innerHTML = '';

  // Every learned skill, grouped into its own category, alphabetized
  // WITHIN each category (a follow-up ask) — the categories themselves
  // stay in SKILL_CATEGORIES' own fixed order, not alphabetical.
  const learned = new Set(Object.keys(myProfile.skills));

  for (const category of SKILL_CATEGORIES) {
    const learnedInCategory = [...learned].filter((s) => skillCategory(s) === category).sort((a, b) => a.localeCompare(b));
    if (learnedInCategory.length === 0) continue;

    renderCategoryHeader(category);
    for (const skillName of learnedInCategory) {
      renderSkillRow(skillName, `${myProfile.skills[skillName]}%`);
    }
  }
}

registerModalOpenHandler(skillsModal, renderSkills);
registerModalRefreshHandler(skillsModal, renderSkills);
