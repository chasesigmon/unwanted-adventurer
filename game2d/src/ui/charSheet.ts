// The character sheet modal — race/level/vitals/attributes/AC/deaths.
import { myProfile } from '../state.js';
import { appendStatRow, charSheetBody, charSheetModal, charSheetUsername, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

const CHAR_SHEET_STAT_DESCRIPTIONS: Record<string, string> = {
  Exp: 'Experience earned toward your next level. Each level requires level x 100 exp.',
  Strength: 'Increases your base melee damage and your parry chance.',
  Intelligence: 'No mechanical effect yet — reserved for future spellcasting.',
  Wisdom: 'No mechanical effect yet — reserved for future use.',
  Dexterity: 'Increases your dodge chance and your Armor Class a little.',
  Constitution: 'Increases your max hp and (with a shield equipped) your shield-block chance.',
  'Consumed Exp': 'A count of body parts you have consumed (+5 each). Goblins reach Hobgoblin evolution at 300.',
  'Armor Class':
    'A base of 10, plus a small dexterity bonus and +5 while a bone shield is equipped. Flatly reduces incoming damage a little on every hit that lands.',
  Deaths: 'Every death (from any cause) counts here. Every 5th costs 1 constitution permanently. At 65, CONDEATH — this character can never be played again.',
};

// Must match game.gateway.ts's own GameGateway.CONDEATH_LIMIT.
const CONDEATH_LIMIT_CLIENT = 65;

export function renderCharSheet(): void {
  if (!myProfile) return;
  charSheetUsername.textContent = myProfile.username;
  charSheetBody.innerHTML = '';

  const rows: Array<[string, string | number]> = [
    ['Race', myProfile.race],
    ['Level', myProfile.level],
    ['Exp', myProfile.exp],
    ['HP', `${myProfile.hp}/${myProfile.maxHp}`],
    ['Mana', `${myProfile.mana}/${myProfile.maxMana}`],
    ['Strength', myProfile.strength],
    ['Intelligence', myProfile.intelligence],
    ['Wisdom', myProfile.wisdom],
    ['Dexterity', myProfile.dexterity],
    ['Constitution', myProfile.constitution],
    ['Armor Class', myProfile.armorClass],
    ['Consumed Exp', myProfile.consumeExp],
    ['Deaths', `${myProfile.deathCount}/${CONDEATH_LIMIT_CLIENT}`],
  ];
  for (const [label, value] of rows) appendStatRow(charSheetBody, label, value, CHAR_SHEET_STAT_DESCRIPTIONS[label]);
}

registerModalOpenHandler(charSheetModal, renderCharSheet);
registerModalRefreshHandler(charSheetModal, renderCharSheet);
