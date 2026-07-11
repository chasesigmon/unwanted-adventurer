// The character-select screen — shown right after account login/register
// succeeds (item 1). Lists the account's existing characters (click one
// to play) and offers a small form to create a new one, with a live
// appearance preview (item 4). Picking a character (existing or freshly
// created) is what actually swaps the held token to a character-level
// one and starts the game.
import { network } from '../state.js';
import type { Gender, HairColor, SkinTone } from '../../shared/constants.js';
import { showAuthScreen } from './authScreen.js';

const screen = document.getElementById('character-select-screen') as HTMLDivElement;
const errorEl = document.getElementById('character-select-error') as HTMLDivElement;
const listEl = document.getElementById('character-list') as HTMLUListElement;
const createForm = document.getElementById('create-character-form') as HTMLFormElement;
const nameInput = document.getElementById('new-character-name') as HTMLInputElement;
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
// a plain CSS background-position rather than a canvas.
function updatePreview(): void {
  const gender = genderSelect.value as Gender;
  const skinTone = skinSelect.value as SkinTone;
  const hairColor = hairSelect.value as HairColor;
  previewEl.style.backgroundImage = `url(/human-${gender}-${skinTone}-${hairColor}-spritesheet.png)`;
  previewEl.style.backgroundSize = '880px 560px';
}
genderSelect.addEventListener('change', updatePreview);
skinSelect.addEventListener('change', updatePreview);
hairSelect.addEventListener('change', updatePreview);

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
      const appearance = c.gender ? `${c.gender}, ${c.skinTone} skin, ${c.hairColor} hair` : c.race;
      li.textContent = `${c.name} — ${appearance}, level ${c.level} (${c.map})`;
      li.addEventListener('click', () => void chooseCharacter(c.name));
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
      await network.createCharacter(name, genderSelect.value as Gender, hairSelect.value as HairColor, skinSelect.value as SkinTone);
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
  nameInput.value = '';
  genderSelect.value = 'male';
  skinSelect.value = 'white';
  hairSelect.value = 'brown';
  updatePreview();
  screen.hidden = false;
  void refreshCharacterList();
}
