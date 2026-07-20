// The character-select screen — shown right after account login/register
// succeeds (item 1). Lists the account's existing characters (click one
// to play) and offers a small form to create a new one, with a live
// appearance preview (item 4). Picking a character (existing or freshly
// created) is what actually swaps the held token to a character-level
// one and starts the game.
import { network } from '../state.js';
import type { Gender, HairColor, SkinTone, PlayableRace } from '../../shared/constants.js';
import { showAuthScreen } from './authScreen.js';

const screen = document.getElementById('character-select-screen') as HTMLDivElement;
const errorEl = document.getElementById('character-select-error') as HTMLDivElement;
const listEl = document.getElementById('character-list') as HTMLUListElement;
const deleteConfirmEl = document.getElementById('character-delete-confirm') as HTMLDivElement;
const deleteConfirmTextEl = document.getElementById('character-delete-confirm-text') as HTMLParagraphElement;
const deleteConfirmYesBtn = document.getElementById('character-delete-confirm-yes') as HTMLButtonElement;
const deleteConfirmNoBtn = document.getElementById('character-delete-confirm-no') as HTMLButtonElement;
const createForm = document.getElementById('create-character-form') as HTMLFormElement;
const nameInput = document.getElementById('new-character-name') as HTMLInputElement;
const raceSelect = document.getElementById('new-character-race') as HTMLSelectElement;
const genderSelect = document.getElementById('new-character-gender') as HTMLSelectElement;
const skinSelect = document.getElementById('new-character-skin') as HTMLSelectElement;
const hairSelect = document.getElementById('new-character-hair') as HTMLSelectElement;
const previewEl = document.getElementById('new-character-preview') as HTMLDivElement;
const logoutBtn = document.getElementById('character-select-logout') as HTMLButtonElement;

let onCharacterChosen: (() => void) | null = null;

export function hideCharacterSelectScreen(): void {
  screen.hidden = true;
}

// The same gender/skin/hair -> spritesheet naming convention
// characterSprites.ts's effectiveSpriteKind uses server-side — the first
// (down-facing idle) frame of that sheet is the live preview, cropped via
// a plain CSS background-position rather than a canvas. A follow-up bug
// fix: "the hair color for races is still not working, and skin tones
// are not working" — the other 4 playable races now vary by skin/hair
// too (just no gender axis, unlike human — see characterSprites.ts's
// NonHumanVariantSpriteKind), so only the GENDER picker hides for them
// now, not skin/hair.
function updatePreview(): void {
  const race = raceSelect.value as PlayableRace;
  const isHuman = race === 'human';
  genderSelect.closest('label')!.hidden = !isHuman;
  const skinTone = skinSelect.value as SkinTone;
  const hairColor = hairSelect.value as HairColor;
  if (isHuman) {
    const gender = genderSelect.value as Gender;
    previewEl.style.backgroundImage = `url(/human-${gender}-${skinTone}-${hairColor}-spritesheet.png)`;
  } else {
    previewEl.style.backgroundImage = `url(/${race}-${skinTone}-${hairColor}-spritesheet.png)`;
  }
  previewEl.style.backgroundSize = '880px 560px';
}
raceSelect.addEventListener('change', updatePreview);
genderSelect.addEventListener('change', updatePreview);
skinSelect.addEventListener('change', updatePreview);
hairSelect.addEventListener('change', updatePreview);

// A follow-up ask: "after they click to delete prompt them with an extra
// 'Are you sure you would like to delete <name>, Lvl. #?'" — a small
// inline confirm block on the select screen itself (this screen has no
// in-game modal system to reuse), one pending name at a time.
let pendingDeleteName: string | null = null;

function promptDeleteCharacter(name: string, level: number): void {
  pendingDeleteName = name;
  deleteConfirmTextEl.textContent = `Are you sure you would like to delete ${name}, Lvl. ${level}?`;
  deleteConfirmEl.hidden = false;
}

function hideDeleteConfirm(): void {
  pendingDeleteName = null;
  deleteConfirmEl.hidden = true;
}

deleteConfirmNoBtn.addEventListener('click', hideDeleteConfirm);

deleteConfirmYesBtn.addEventListener('click', () => {
  void (async () => {
    if (!pendingDeleteName) return;
    const name = pendingDeleteName;
    hideDeleteConfirm();
    errorEl.textContent = '';
    try {
      await network.deleteCharacter(name);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Could not delete that character.';
      return;
    }
    await refreshCharacterList();
  })();
});

async function refreshCharacterList(): Promise<void> {
  listEl.innerHTML = '<li class="character-list-loading">Loading...</li>';
  try {
    const characters = await network.listCharacters();
    listEl.innerHTML = '';
    if (characters.length === 0) {
      const li = document.createElement('li');
      li.className = 'character-list-empty';
      li.textContent = 'No characters yet — create one below.';
      listEl.appendChild(li);
      return;
    }
    for (const c of characters) {
      const li = document.createElement('li');
      li.className = 'character-list-item';

      const label = document.createElement('span');
      // Only human's own texture actually varies by gender/skin/hair (a
      // later follow-up ask restored race as a real choice) — every other
      // playable race just shows its own name instead.
      const appearance = c.race === 'human' ? `${c.gender}, ${c.skinTone} skin, ${c.hairColor} hair` : c.race;
      label.textContent = `${c.name} — ${appearance}, level ${c.level} (${c.map})`;
      label.className = 'character-list-label';
      label.addEventListener('click', () => void chooseCharacter(c.name));
      li.appendChild(label);

      // A later follow-up ask: "show a specialization badge on the
      // character select screen" — absent until level 10 and chosen (see
      // CharacterSummary's own doc comment).
      if (c.specialization) {
        const badge = document.createElement('span');
        badge.className = 'character-specialization-badge';
        badge.textContent = c.specialization.charAt(0).toUpperCase() + c.specialization.slice(1);
        li.appendChild(badge);
      }

      // A follow-up ask: "the ability for people to delete players from
      // their character selection page" — stopPropagation so clicking
      // Delete doesn't ALSO select/play the character underneath it.
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'character-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = `Delete ${c.name}`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptDeleteCharacter(c.name, c.level);
      });
      li.appendChild(deleteBtn);

      listEl.appendChild(li);
    }
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : 'Could not load characters.';
  }
}

async function chooseCharacter(name: string): Promise<void> {
  errorEl.textContent = '';
  try {
    await network.selectCharacter(name);
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : 'Could not select that character.';
    return;
  }
  onCharacterChosen?.();
}

createForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    errorEl.textContent = '';
    const name = nameInput.value.trim();
    try {
      await network.createCharacter(
        name,
        raceSelect.value as PlayableRace,
        genderSelect.value as Gender,
        hairSelect.value as HairColor,
        skinSelect.value as SkinTone
      );
      await network.selectCharacter(name);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Could not create that character.';
      return;
    }
    onCharacterChosen?.();
  })();
});

logoutBtn.addEventListener('click', () => {
  void network.logout().finally(() => {
    hideCharacterSelectScreen();
    showAuthScreen();
  });
});

// `onChosen` fires once a character is actually selected (existing or
// freshly created) — this is what main.ts wires to startGame().
export function showCharacterSelectScreen(onChosen: () => void): void {
  onCharacterChosen = onChosen;
  errorEl.textContent = '';
  hideDeleteConfirm();
  nameInput.value = '';
  raceSelect.value = 'human';
  genderSelect.value = 'male';
  skinSelect.value = 'white';
  hairSelect.value = 'brown';
  updatePreview();
  screen.hidden = false;
  void refreshCharacterList();
}
