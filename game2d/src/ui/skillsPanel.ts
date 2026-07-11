// The Skills modal — every learned skill plus, optionally, a "Show All"
// preview of skills this character could still acquire down their
// current path.
import { myProfile } from '../state.js';
import { STARTING_SKILLS, HOBGOBLIN_EVOLUTION_SKILLS, RESISTANCE_SKILLS } from '../../shared/skills.js';
import { attachTooltip } from './tooltip.js';
import { SKILL_DESCRIPTIONS, createCooldownOverlay, isAttackSkill, isUsableSkill, skillIconColor, skillIconLetter } from './skillMeta.js';
import { actionBarSkills, assignActionSlot, saveActionBar } from './actionBar.js';
import { logCombatMessage } from './log.js';
import { registerModalOpenHandler, registerModalRefreshHandler, skillsBody, skillsModal, skillsShowAllToggle } from './modalCore.js';

// There's no real per-level skill unlock system in this project — skills
// are granted at creation, on evolving, or by chance on consuming a body
// part, never gated behind a specific character level. "Show All" instead
// previews every skill this character could ever still acquire down their
// current path (their base kit, the Hobgoblin-exclusive skills if they
// haven't evolved yet, and the resistance skills), so the player can see
// what's left to earn.
let showAllSkills = false;

function acquirableSkillPool(): string[] {
  const pool = new Set(STARTING_SKILLS);
  if (myProfile?.race !== 'hobgoblin') {
    for (const skill of HOBGOBLIN_EVOLUTION_SKILLS) pool.add(skill);
  }
  for (const skill of RESISTANCE_SKILLS) pool.add(skill);
  return [...pool];
}

// A skill row with a small icon to the left of its name — built by hand
// rather than reusing appendStatRow, since a usable skill's icon also
// needs to be draggable into the action bar.
function renderSkillRow(skillName: string, valueText: string, notAcquired: boolean): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label skill-label';

  const icon = document.createElement('span');
  icon.className = 'skill-icon';
  icon.textContent = skillIconLetter(skillName);
  icon.style.background = skillIconColor(skillName);

  const usable = !notAcquired && isUsableSkill(skillName);
  if (usable) {
    icon.draggable = true;
    icon.classList.add('draggable');
    attachTooltip(icon, () => 'Drag to the action bar (or double-click) to use on your selected target');
    icon.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', skillName);
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
  if (notAcquired) valueEl.classList.add('not-acquired');

  skillsBody.appendChild(labelEl);
  skillsBody.appendChild(valueEl);
}

export function renderSkills(): void {
  if (!myProfile) return;
  skillsBody.innerHTML = '';
  for (const [skillName, percent] of Object.entries(myProfile.skills)) {
    renderSkillRow(skillName, `${percent}%`, false);
  }
  if (showAllSkills) {
    for (const skillName of acquirableSkillPool()) {
      if (myProfile.skills[skillName] !== undefined) continue;
      renderSkillRow(skillName, '(not yet acquired)', true);
    }
  }
}

skillsShowAllToggle.addEventListener('click', () => {
  showAllSkills = !showAllSkills;
  skillsShowAllToggle.classList.toggle('active', showAllSkills);
  renderSkills();
});

registerModalOpenHandler(skillsModal, renderSkills);
registerModalRefreshHandler(skillsModal, renderSkills);
