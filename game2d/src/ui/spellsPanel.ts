// The Spells modal — a separate button/panel from Skills (item 14:
// "Skills & Spells are different things, players will have both
// eventually"). A read-only reference list of every spell defined in
// shared/spells.ts (every one of them is a real, learnable/castable spell
// now — actually learned/cast through the Skills system, see
// shared/skills.ts, rather than from here, so there's nothing to drag
// from this modal). A follow-up ask: still list every spell (so a player
// can see what's out there to learn), but visually distinguish which
// ones this character has actually learned yet — a spell's own name
// doubles as its skill key (see shared/skills.ts's AUGUE_SKILL etc., each
// just the plain spell name string), so myProfile.skills already has
// everything needed to tell the two apart.
import { myProfile } from '../state.js';
import { SPELLS } from '../../shared/spells.js';
import { spellsBody, spellsModal, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

function renderSpells(): void {
  spellsBody.innerHTML = '';
  const learned = new Set(Object.keys(myProfile?.skills ?? {}));
  for (const spell of SPELLS) {
    const row = document.createElement('div');
    row.className = 'spell-row';
    if (!learned.has(spell.name)) row.classList.add('spell-not-learned');

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
registerModalRefreshHandler(spellsModal, renderSpells);
