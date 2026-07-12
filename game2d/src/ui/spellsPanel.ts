// The Spells modal — a separate button/panel from Skills (item 14:
// "Skills & Spells are different things, players will have both
// eventually"). For now this is a read-only reference list of every
// spell defined in shared/spells.ts, most of which are still flavor text
// with no mechanical effect yet; lucem is the one exception, but it's
// learned/cast through the existing Skills system (see shared/skills.ts's
// LUCEM_SKILL) rather than from here, so there's nothing to drag from
// this modal today.
import { SPELLS } from '../../shared/spells.js';
import { spellsBody, spellsModal, registerModalOpenHandler } from './modalCore.js';

function renderSpells(): void {
  spellsBody.innerHTML = '';
  for (const spell of SPELLS) {
    const row = document.createElement('div');
    row.className = 'spell-row';

    const name = document.createElement('div');
    name.className = 'spell-name';
    name.textContent = spell.name;
    row.appendChild(name);

    const description = document.createElement('div');
    description.className = 'spell-description';
    description.textContent = spell.description;
    row.appendChild(description);

    spellsBody.appendChild(row);
  }
}

registerModalOpenHandler(spellsModal, renderSpells);
