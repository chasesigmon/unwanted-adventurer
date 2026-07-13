// The character sheet modal — race/level/vitals/attributes/AC/deaths.
import { myProfile, network } from '../state.js';
import { logCombatMessage } from './log.js';
import { appendStatRow, charSheetBody, charSheetModal, charSheetUsername, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';
import { attachTooltip } from './tooltip.js';
import type { AllocatableStat } from '../../shared/types.js';

const CHAR_SHEET_STAT_DESCRIPTIONS: Record<string, string> = {
  Exp: 'Experience earned toward your next level. Each level requires level x 100 exp.',
  Strength: 'Increases your base melee damage and your parry chance.',
  Intelligence: 'Each point increases your max mana by 10 and adds +1% success chance to every spell you cast.',
  Wisdom: 'No mechanical effect yet — reserved for future use.',
  Dexterity: 'Increases your dodge chance, your Armor Class a little, and how fast you can move.',
  Constitution: 'Increases your max hp by 20 per point and (with a shield equipped) your shield-block chance.',
  Luck: "Gives every spell cast a chance at a bonus to its own success chance, and boosts how much your skills/spells can grow from casting them.",
  'Armor Class':
    'A base of 10, plus a small dexterity bonus and +5 while a bone shield is equipped. Flatly reduces incoming damage a little on every hit that lands.',
  Deaths: 'Every death (from any cause) counts here. Every 5th costs 1 constitution permanently. At 65, CONDEATH — this character can never be played again.',
  Hunger: 'Drops by 1 every game hour. Eating jerky restores 20. No mechanical effect yet at 0 — reserved for future use.',
  Thirst: 'Drops by 1 every game hour. Drinking from your canteen or a cup of water restores 20. No mechanical effect yet at 0 — reserved for future use.',
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
  charSheetBody.innerHTML = '';

  const hasPoints = myProfile.statPointsAvailable > 0;

  appendStatRow(charSheetBody, 'Race', myProfile.race);
  appendStatRow(charSheetBody, 'Level', myProfile.level);
  appendStatRow(charSheetBody, 'Exp', myProfile.exp, CHAR_SHEET_STAT_DESCRIPTIONS.Exp);
  appendStatRow(charSheetBody, 'HP', `${myProfile.hp}/${myProfile.maxHp}`);
  appendStatRow(charSheetBody, 'Mana', `${myProfile.mana}/${myProfile.maxMana}`);
  appendStatRow(charSheetBody, 'Hunger', `${myProfile.hunger}/100`, CHAR_SHEET_STAT_DESCRIPTIONS.Hunger);
  appendStatRow(charSheetBody, 'Thirst', `${myProfile.thirst}/100`, CHAR_SHEET_STAT_DESCRIPTIONS.Thirst);
  if (hasPoints) {
    appendStatRow(
      charSheetBody,
      'Stat Points',
      myProfile.statPointsAvailable,
      "You've leveled up! Spend these on any stat below using its + button."
    );
  }
  for (const { label, stat } of ALLOCATABLE_STATS) {
    appendAllocatableStatRow(label, stat, myProfile[stat], hasPoints);
  }
  appendStatRow(charSheetBody, 'Armor Class', myProfile.armorClass, CHAR_SHEET_STAT_DESCRIPTIONS['Armor Class']);
  appendStatRow(charSheetBody, 'Deaths', `${myProfile.deathCount}/${CONDEATH_LIMIT_CLIENT}`, CHAR_SHEET_STAT_DESCRIPTIONS.Deaths);
}

registerModalOpenHandler(charSheetModal, renderCharSheet);
registerModalRefreshHandler(charSheetModal, renderCharSheet);
