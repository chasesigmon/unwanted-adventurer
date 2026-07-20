// The character sheet modal — race/level/vitals/attributes/AC/deaths.
import { myProfile, network } from '../state.js';
import { logCombatMessage } from './log.js';
import {
  appendStatRow,
  charSheetBody,
  charSheetModal,
  charSheetPreview,
  charSheetUsername,
  registerModalOpenHandler,
  registerModalRefreshHandler,
  wholeNumber,
} from './modalCore.js';
import { attachTooltip } from './tooltip.js';
import type { AllocatableStat } from '../../shared/types.js';

const CHAR_SHEET_STAT_DESCRIPTIONS: Record<string, string> = {
  Exp: 'Experience earned toward your next level. Each level requires level x 100 exp.',
  // Parry isn't implemented yet (may be added later) — dropped from
  // this description (a follow-up ask).
  Strength: 'Increases your base melee damage.',
  Intelligence:
    'Each point increases your max mana by 10, adds +1% success chance to every spell you cast, adds ranged damage when attacking with a wand equipped, and increases how much mana you regain from resting/sleeping.',
  Wisdom: 'Increases your Armor vs Magical a little, resisting incoming spell damage.',
  // Dodge isn't implemented yet (may be added later) — dropped from
  // this description (a follow-up ask).
  Dexterity: 'Increases your Armor vs Physical a little and how fast you can move.',
  // Shield block isn't implemented yet (may be added later) — dropped
  // from this description (a follow-up ask).
  Constitution: 'Increases your max hp by 20 per point.',
  Luck: "Gives every spell cast a chance at a bonus to its own success chance, and boosts how much your skills/spells can grow from casting them.",
  'Armor vs Physical':
    'A small base, plus a bit from dexterity and strength, plus whatever armor you have equipped (cloth +1 each, studded +3 each, ...). Flatly reduces incoming melee/punch/dagger damage on every hit that lands.',
  'Armor vs Magical':
    'A small base, plus a bit from intelligence and wisdom, plus whatever armor grants it (nothing does yet). Flatly reduces incoming spell damage (bolts, wand bolt, augue, ...) on every hit that lands.',
  Deaths: 'Every death (from any cause) counts here. Every 5th costs 1 constitution permanently. At 65, CONDEATH — this character can never be played again.',
  Hunger: 'Drops by 1 every game hour. Eating jerky restores 20. No mechanical effect yet at 0 — reserved for future use.',
  Thirst: 'Drops by 1 every game hour. Drinking from your canteen or a cup of water restores 20. No mechanical effect yet at 0 — reserved for future use.',
  Movement: 'Costs a fraction of a point per tile moved; regenerates on its own like hp/mana. No mechanical effect yet at 0 — reserved for future use.',
  'Training Points': 'Gained every 5th level. Spend these on any stat below using its + button.',
  'Practice Points': 'Gained every level. Spend these with a classroom/specialization teacher to learn new skills and spells.',
};

// Must match game.gateway.ts's own GameGateway.CONDEATH_LIMIT.
const CONDEATH_LIMIT_CLIENT = 65;

// A later follow-up ask replaced the old automatic per-level attribute
// bonus with player-chosen stat points — these 6 rows get a "+" button
// appended to their value cell while any are available (see
// PlayerSnapshot.statPointsAvailable), disappearing again the instant
// they're all spent.
const ALLOCATABLE_STATS: Array<{ label: string; stat: AllocatableStat }> = [
  { label: 'Strength', stat: 'strength' },
  { label: 'Intelligence', stat: 'intelligence' },
  { label: 'Wisdom', stat: 'wisdom' },
  { label: 'Dexterity', stat: 'dexterity' },
  { label: 'Constitution', stat: 'constitution' },
  { label: 'Luck', stat: 'luck' },
];

let allocating = false;

function appendAllocatableStatRow(label: string, stat: AllocatableStat, value: number, hasPoints: boolean): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;
  const description = CHAR_SHEET_STAT_DESCRIPTIONS[label];
  if (description) {
    attachTooltip(labelEl, () => description);
    labelEl.style.cursor = 'help';
  }

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = String(value);

  if (hasPoints) {
    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'stat-allocate-btn';
    plusBtn.textContent = '+';
    attachTooltip(plusBtn, () => `Spend a stat point on ${label.toLowerCase()}.`);
    plusBtn.addEventListener('click', () => {
      if (allocating) return;
      allocating = true;
      plusBtn.disabled = true;
      void network
        .allocateStatPoint(stat)
        .then((ack) => {
          if (!ack.ok && ack.message) logCombatMessage(ack.message);
          // A successful allocation's own 'sync' event re-renders this
          // whole modal (see registerModalRefreshHandler below) — nothing
          // else to do here either way.
        })
        .finally(() => {
          allocating = false;
        });
    });
    valueEl.appendChild(plusBtn);
  }

  charSheetBody.appendChild(labelEl);
  charSheetBody.appendChild(valueEl);
}

export function renderCharSheet(): void {
  if (!myProfile) return;
  charSheetUsername.textContent = myProfile.username;
  // A later follow-up ask: "a sprite preview on the character sheet" —
  // same skin/hair -> spritesheet naming convention (and same first-frame
  // crop) characterSelect.ts's own live preview already uses. A follow-up
  // bug fix made the other 4 playable races vary by skin/hair too (just
  // no gender axis), so this is the same shape for every race now.
  charSheetPreview.style.backgroundImage =
    myProfile.race === 'human'
      ? `url(/human-${myProfile.gender}-${myProfile.skinTone}-${myProfile.hairColor}-spritesheet.png)`
      : `url(/${myProfile.race}-${myProfile.skinTone}-${myProfile.hairColor}-spritesheet.png)`;
  charSheetPreview.style.backgroundSize = '880px 560px';
  charSheetBody.innerHTML = '';

  const hasPoints = myProfile.statPointsAvailable > 0;

  appendStatRow(charSheetBody, 'Race', myProfile.race);
  // House/specialization (a follow-up ask) — "None" until chosen (see
  // the new house-assignment teacher/Specialization room's own
  // dialogues), permanent afterward.
  appendStatRow(charSheetBody, 'House', myProfile.house ?? 'None');
  appendStatRow(charSheetBody, 'Specialization', myProfile.specialization ?? 'None');
  appendStatRow(charSheetBody, 'Level', myProfile.level);
  appendStatRow(charSheetBody, 'Exp', myProfile.exp, CHAR_SHEET_STAT_DESCRIPTIONS.Exp);
  appendStatRow(charSheetBody, 'HP', `${myProfile.hp}/${myProfile.maxHp}`);
  appendStatRow(charSheetBody, 'Mana', `${myProfile.mana}/${myProfile.maxMana}`);
  // A follow-up ask: "add movement to the character sheet" — same
  // whole-number-only display the status bar's own MV already uses.
  appendStatRow(charSheetBody, 'Movement', `${wholeNumber(myProfile.mv)}/${wholeNumber(myProfile.maxMv)}`, CHAR_SHEET_STAT_DESCRIPTIONS.Movement);
  appendStatRow(charSheetBody, 'Hunger', `${wholeNumber(myProfile.hunger ?? 100)}/100`, CHAR_SHEET_STAT_DESCRIPTIONS.Hunger);
  appendStatRow(charSheetBody, 'Thirst', `${wholeNumber(myProfile.thirst ?? 100)}/100`, CHAR_SHEET_STAT_DESCRIPTIONS.Thirst);
  // A follow-up ask: "add the number of trains & practices the player
  // has to the character sheet" — always visible now (not just while
  // > 0, unlike the individual stat rows' own + buttons below, which
  // still only appear while there's actually something to spend).
  appendStatRow(charSheetBody, 'Training Points', myProfile.statPointsAvailable, CHAR_SHEET_STAT_DESCRIPTIONS['Training Points']);
  appendStatRow(charSheetBody, 'Practice Points', myProfile.practicePointsAvailable, CHAR_SHEET_STAT_DESCRIPTIONS['Practice Points']);
  for (const { label, stat } of ALLOCATABLE_STATS) {
    appendAllocatableStatRow(label, stat, myProfile[stat], hasPoints);
  }
  appendStatRow(charSheetBody, 'Armor vs Physical', myProfile.armorVsPhysical, CHAR_SHEET_STAT_DESCRIPTIONS['Armor vs Physical']);
  appendStatRow(charSheetBody, 'Armor vs Magical', myProfile.armorVsMagical, CHAR_SHEET_STAT_DESCRIPTIONS['Armor vs Magical']);
  appendStatRow(charSheetBody, 'Deaths', `${myProfile.deathCount}/${CONDEATH_LIMIT_CLIENT}`, CHAR_SHEET_STAT_DESCRIPTIONS.Deaths);
}

registerModalOpenHandler(charSheetModal, renderCharSheet);
registerModalRefreshHandler(charSheetModal, renderCharSheet);

// A later follow-up bug fix: "while moving with the skill modal open the
// icons are constantly blinking" — the ordinary move-ack handler
// (WorldScene.ts) used to call the blanket refreshOpenModals() to keep
// THIS modal's own mv/hp/mana live (see renderCharSheet's own doc
// comment), but that indiscriminately re-rendered every OTHER open
// modal too, including the Skills panel, which fully wipes and rebuilds
// every skill icon from scratch on each call — nothing about a move
// changes any skill, so multiple times a second while walking that
// panel's icons kept flashing for no reason. A move only ever needs to
// keep THIS modal current, so it's called directly and scoped to "only
// if actually open" instead.
export function refreshCharSheetIfOpen(): void {
  if (!charSheetModal.hidden) renderCharSheet();
}
