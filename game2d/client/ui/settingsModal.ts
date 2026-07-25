// Item 3: the gear-icon Settings modal — Account (real account username +
// current character name) and Action Bars (fully customizable multi-bar
// system — see actionBars.ts) tabs. Tab-switching mirrors mapModal.ts's
// own Here/World Map/Who/Where pattern exactly.
import { myProfile, network } from '../state.js';
import {
  registerModalOpenHandler,
  settingsBody,
  settingsModal,
  settingsTabAccountBtn,
  settingsTabActionBarsBtn,
} from './modalCore.js';
import {
  ACTION_BAR_MAX_COLS,
  ACTION_BAR_MAX_ROWS,
  ACTION_BAR_MIN_COLS,
  ACTION_BAR_MIN_ROWS,
  ACTION_BAR_POSITIONS,
  ACTION_BAR_POSITION_LABELS,
  addActionBar,
  comboForKeyboardEvent,
  getActionBars,
  removeActionBar,
  resizeActionBar,
  setActionBarHotkey,
  type ActionBarPosition,
} from './actionBars.js';

type SettingsTab = 'account' | 'actionBars';
let activeSettingsTab: SettingsTab = 'account';

// Fetched once per page load (an account's own username/email never
// change mid-session) — cheap to keep around rather than re-hitting the
// server every time the Account tab is (re-)opened.
let accountInfo: { username: string; email: string } | null = null;
let accountInfoError: string | null = null;

function updateSettingsTabButtons(): void {
  settingsTabAccountBtn.classList.toggle('active', activeSettingsTab === 'account');
  settingsTabActionBarsBtn.classList.toggle('active', activeSettingsTab === 'actionBars');
}

function switchSettingsTab(tab: SettingsTab): void {
  activeSettingsTab = tab;
  updateSettingsTabButtons();
  renderSettingsTab();
}
settingsTabAccountBtn.addEventListener('click', () => switchSettingsTab('account'));
settingsTabActionBarsBtn.addEventListener('click', () => switchSettingsTab('actionBars'));

function renderAccountTab(): void {
  settingsBody.innerHTML = '';

  const characterRow = document.createElement('div');
  characterRow.className = 'settings-account-row';
  characterRow.innerHTML = `<span class="stat-label">Character:</span> <span>${myProfile?.username ?? '—'}</span>`;
  settingsBody.appendChild(characterRow);

  const accountRow = document.createElement('div');
  accountRow.className = 'settings-account-row';
  if (accountInfo) {
    accountRow.innerHTML = `<span class="stat-label">Account:</span> <span>${accountInfo.username} (${accountInfo.email})</span>`;
  } else if (accountInfoError) {
    accountRow.innerHTML = `<span class="stat-label">Account:</span> <span>${accountInfoError}</span>`;
  } else {
    accountRow.innerHTML = `<span class="stat-label">Account:</span> <span>Loading...</span>`;
    network
      .getAccountInfo()
      .then((info) => {
        accountInfo = info;
        accountInfoError = null;
        if (activeSettingsTab === 'account') renderAccountTab();
      })
      .catch(() => {
        accountInfoError = 'Unavailable.';
        if (activeSettingsTab === 'account') renderAccountTab();
      });
  }
  settingsBody.appendChild(accountRow);
}

// One-shot key-capture: the very next keydown anywhere becomes the new
// hotkey combo — Escape cancels without changing anything, a bare
// modifier key (Shift/Control/Alt/Meta on its own) is ignored and capture
// keeps listening, since a modifier alone can't usefully identify a slot.
function beginHotkeyCapture(valueEl: HTMLElement, onCaptured: (combo: string | null) => void): void {
  valueEl.textContent = 'Press a key...';
  valueEl.classList.add('capturing');
  const handler = (e: KeyboardEvent) => {
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
      return; // keep listening for the real key
    }
    e.preventDefault();
    document.removeEventListener('keydown', handler, true);
    valueEl.classList.remove('capturing');
    if (e.code === 'Escape') {
      onCaptured(null);
      return;
    }
    onCaptured(comboForKeyboardEvent(e));
  };
  document.addEventListener('keydown', handler, true);
}

function formatCombo(combo: string | null): string {
  if (!combo) return '(none)';
  return combo
    .replace('shift+', 'Shift+')
    .replace('ctrl+', 'Ctrl+')
    .replace('alt+', 'Alt+')
    .replace('Digit', '')
    .replace('Key', '');
}

function renderActionBarsTab(): void {
  settingsBody.innerHTML = '';
  const bars = getActionBars();

  for (const bar of bars) {
    const card = document.createElement('div');
    card.className = 'settings-actionbar-card';

    const header = document.createElement('div');
    header.className = 'settings-actionbar-card-header';
    const title = document.createElement('span');
    title.textContent = ACTION_BAR_POSITION_LABELS[bar.position];
    header.appendChild(title);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove bar';
    removeBtn.addEventListener('click', () => {
      removeActionBar(bar.id);
      renderActionBarsTab();
    });
    header.appendChild(removeBtn);
    card.appendChild(header);

    const controls = document.createElement('div');
    controls.className = 'settings-actionbar-controls';
    const rowsLabel = document.createElement('label');
    rowsLabel.textContent = 'Rows: ';
    const rowsInput = document.createElement('input');
    rowsInput.type = 'number';
    rowsInput.min = String(ACTION_BAR_MIN_ROWS);
    rowsInput.max = String(ACTION_BAR_MAX_ROWS);
    rowsInput.value = String(bar.rows);
    rowsInput.addEventListener('change', () => {
      resizeActionBar(bar.id, Number(rowsInput.value) || bar.rows, bar.cols);
      renderActionBarsTab();
    });
    rowsLabel.appendChild(rowsInput);
    controls.appendChild(rowsLabel);

    const colsLabel = document.createElement('label');
    colsLabel.textContent = 'Columns: ';
    const colsInput = document.createElement('input');
    colsInput.type = 'number';
    colsInput.min = String(ACTION_BAR_MIN_COLS);
    colsInput.max = String(ACTION_BAR_MAX_COLS);
    colsInput.value = String(bar.cols);
    colsInput.addEventListener('change', () => {
      resizeActionBar(bar.id, bar.rows, Number(colsInput.value) || bar.cols);
      renderActionBarsTab();
    });
    colsLabel.appendChild(colsInput);
    controls.appendChild(colsLabel);
    card.appendChild(controls);

    const filledSlots = bar.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.skill !== null);
    if (filledSlots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-hotkey-row';
      empty.textContent = 'Drag skills onto this bar in-game to assign them, then set a hotkey here.';
      card.appendChild(empty);
    }
    for (const { slot, index } of filledSlots) {
      const row = document.createElement('div');
      row.className = 'settings-hotkey-row';
      const label = document.createElement('span');
      label.textContent = slot.skill;
      row.appendChild(label);

      const valueEl = document.createElement('span');
      valueEl.className = 'settings-hotkey-value';
      valueEl.textContent = formatCombo(slot.hotkey);
      row.appendChild(valueEl);

      const setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.textContent = 'Set';
      setBtn.addEventListener('click', () => {
        beginHotkeyCapture(valueEl, (combo) => {
          if (combo) setActionBarHotkey(bar.id, index, combo);
          renderActionBarsTab();
        });
      });
      row.appendChild(setBtn);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear';
      clearBtn.disabled = !slot.hotkey;
      clearBtn.addEventListener('click', () => {
        setActionBarHotkey(bar.id, index, null);
        renderActionBarsTab();
      });
      row.appendChild(clearBtn);

      card.appendChild(row);
    }

    settingsBody.appendChild(card);
  }

  const usedPositions = new Set(bars.map((b) => b.position));
  const availablePositions = ACTION_BAR_POSITIONS.filter((p) => !usedPositions.has(p));
  if (availablePositions.length > 0) {
    const addRow = document.createElement('div');
    addRow.className = 'settings-add-bar-row';
    const select = document.createElement('select');
    for (const position of availablePositions) {
      const option = document.createElement('option');
      option.value = position;
      option.textContent = ACTION_BAR_POSITION_LABELS[position];
      select.appendChild(option);
    }
    addRow.appendChild(select);
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add Action Bar';
    addBtn.addEventListener('click', () => {
      addActionBar(select.value as ActionBarPosition);
      renderActionBarsTab();
    });
    addRow.appendChild(addBtn);
    settingsBody.appendChild(addRow);
  }
}

function renderSettingsTab(): void {
  if (activeSettingsTab === 'account') renderAccountTab();
  else renderActionBarsTab();
}

export function openSettingsModal(): void {
  activeSettingsTab = 'account';
  updateSettingsTabButtons();
  renderSettingsTab();
}

registerModalOpenHandler(settingsModal, openSettingsModal);
