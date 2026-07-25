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
import { showCenterToast } from './toast.js';
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
  // A fresh entry into Action Bars always starts clean — any unsaved
  // row/col edit left over from a previous visit this session is
  // discarded rather than silently resurfacing later.
  if (tab === 'actionBars') pendingSizes.clear();
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

// A follow-up ask: "add a 'Save Changes' button that the player needs to
// click after making an update to any row or column box in order for the
// changes to take effect" — row/col edits no longer call resizeActionBar
// immediately on every keystroke; they stage into this map (keyed by
// barId) instead, and only actually apply when Save Changes is clicked.
// Cleared whenever the tab is freshly entered or a bar is added/removed
// (a staged size for a bar that just changed/vanished is meaningless),
// but deliberately PRESERVED across the re-renders a hotkey Set/Clear
// triggers, so setting a hotkey doesn't silently discard an unsaved
// row/col edit sitting in the same card.
const pendingSizes = new Map<string, { rows: number; cols: number }>();

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
      pendingSizes.delete(bar.id);
      removeActionBar(bar.id);
      renderActionBarsTab();
    });
    header.appendChild(removeBtn);
    card.appendChild(header);

    const staged = pendingSizes.get(bar.id);

    const controls = document.createElement('div');
    controls.className = 'settings-actionbar-controls';
    const rowsLabel = document.createElement('label');
    rowsLabel.textContent = 'Rows: ';
    const rowsInput = document.createElement('input');
    rowsInput.type = 'number';
    rowsInput.min = String(ACTION_BAR_MIN_ROWS);
    rowsInput.max = String(ACTION_BAR_MAX_ROWS);
    rowsInput.value = String(staged?.rows ?? bar.rows);
    rowsLabel.appendChild(rowsInput);
    controls.appendChild(rowsLabel);

    const colsLabel = document.createElement('label');
    colsLabel.textContent = 'Columns: ';
    const colsInput = document.createElement('input');
    colsInput.type = 'number';
    colsInput.min = String(ACTION_BAR_MIN_COLS);
    colsInput.max = String(ACTION_BAR_MAX_COLS);
    colsInput.value = String(staged?.cols ?? bar.cols);
    colsLabel.appendChild(colsInput);
    controls.appendChild(colsLabel);
    card.appendChild(controls);

    // Neither input applies immediately — both just update the SAME
    // staged entry (reading whichever field didn't just change from the
    // other input's own current value), so editing rows then cols (or
    // vice versa) before ever clicking Save Changes stages both together.
    const stageSize = () => {
      pendingSizes.set(bar.id, {
        rows: Number(rowsInput.value) || bar.rows,
        cols: Number(colsInput.value) || bar.cols,
      });
      renderActionBarsTab();
    };
    rowsInput.addEventListener('change', stageSize);
    colsInput.addEventListener('change', stageSize);

    // Item 4 (follow-up ask): "don't show the skills/spells that are on
    // the slots, players will drag or fill in those slots themselves
    // through the spells modal" — hotkeys bind to a SLOT POSITION
    // (barId + index), not to whatever skill currently happens to sit
    // there (see actionBars.ts's own setActionBarHotkey), so this lists
    // every slot by number only, never reading slot.skill.
    for (let index = 0; index < bar.slots.length; index++) {
      const slot = bar.slots[index]!;
      const row = document.createElement('div');
      row.className = 'settings-hotkey-row';
      const label = document.createElement('span');
      label.textContent = `Slot ${index + 1}`;
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
          if (combo) {
            // A follow-up ask: "allow the mapping update but show a
            // tooltip message that the old mapping has been removed" —
            // setActionBarHotkey silently steals a hotkey from wherever
            // else it was bound; this is the one place that matters to a
            // player, so it's surfaced here rather than inside that
            // function itself.
            const stolenFromElsewhere = setActionBarHotkey(bar.id, index, combo);
            if (stolenFromElsewhere) {
              showCenterToast(`${formatCombo(combo)} was already bound to another slot — that mapping has been removed.`);
            }
          }
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

  // A follow-up ask: "move the save changes button for settings/action
  // bars to appear at the bottom instead of the top" — rendered last, so
  // it always sits below every bar card and the "Add Action Bar" row
  // above, regardless of how many bars are configured.
  if (pendingSizes.size > 0) {
    const saveRow = document.createElement('div');
    saveRow.className = 'settings-add-bar-row';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save Changes';
    saveBtn.addEventListener('click', () => {
      for (const [barId, size] of pendingSizes) resizeActionBar(barId, size.rows, size.cols);
      pendingSizes.clear();
      renderActionBarsTab();
    });
    saveRow.appendChild(saveBtn);
    const hint = document.createElement('span');
    hint.textContent = 'Unsaved row/column changes — click to apply.';
    hint.style.fontSize = '11px';
    hint.style.color = '#f0c040';
    saveRow.appendChild(hint);
    settingsBody.appendChild(saveRow);
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
