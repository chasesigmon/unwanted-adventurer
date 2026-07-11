// The character-select screen — shown right after account login/register
// succeeds (item 1). Lists the account's existing characters (click one
// to play) and offers a small form to create a new one. Picking a
// character (existing or freshly created) is what actually swaps the
// held token to a character-level one and starts the game.
import { network } from '../state.js';
import { showAuthScreen } from './authScreen.js';

const screen = document.getElementById('character-select-screen') as HTMLDivElement;
const errorEl = document.getElementById('character-select-error') as HTMLDivElement;
const listEl = document.getElementById('character-list') as HTMLUListElement;
const createForm = document.getElementById('create-character-form') as HTMLFormElement;
const nameInput = document.getElementById('new-character-name') as HTMLInputElement;
const raceSelect = document.getElementById('new-character-race') as HTMLSelectElement;
const logoutBtn = document.getElementById('character-select-logout') as HTMLButtonElement;

let onCharacterChosen: (() => void) | null = null;

export function hideCharacterSelectScreen(): void {
  screen.hidden = true;
}

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
      li.textContent = `${c.name} — ${c.race}, level ${c.level} (${c.map})`;
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
      await network.createCharacter(name, raceSelect.value);
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
  screen.hidden = false;
  void refreshCharacterList();
}
