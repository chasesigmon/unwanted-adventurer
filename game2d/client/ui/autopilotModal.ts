// The autopilot/"prompt" modal — a simple keyword-triggered "roam and
// punch the nearest matching monster" loop, started by typing a sentence
// mentioning a monster kind.
import { activeScene } from '../state.js';
import type { MonsterKind } from '../../shared/constants.js';
import { logCombatMessage } from './log.js';
import { autopilotInput, autopilotModal, closeAllModals, hideModal, updateInputCaptured } from './modalCore.js';

const autopilotBtn = document.getElementById('autopilot-btn') as HTMLButtonElement;

// Dismissing the PROMPT modal specifically (X, click-outside, or 'p'
// again while it's open) both closes it and ends any active hunt — per
// the explicit request that dismissing it "should close and end
// tracking". Submitting a command (Enter) is a separate path that closes
// the modal WITHOUT stopping anything, since it's what starts the hunt in
// the first place.
export function dismissAutopilotModal(): void {
  hideModal(autopilotModal);
  updateInputCaptured();
  activeScene?.stopAutopilot('Autopilot stopped.');
}

function openAutopilotModal(): void {
  // closeAllModals just hides every modal (including, harmlessly,
  // autopilotModal itself right before it's re-shown below) — it doesn't
  // stop an active hunt, so opening the prompt mid-hunt to check status
  // doesn't cancel it.
  closeAllModals();
  autopilotModal.hidden = false;
  autopilotInput.value = '';
  autopilotInput.focus();
  updateInputCaptured();
}

export function toggleAutopilotModal(): void {
  if (!autopilotModal.hidden) {
    dismissAutopilotModal();
    return;
  }
  openAutopilotModal();
}
autopilotBtn.addEventListener('click', toggleAutopilotModal);

autopilotModal.addEventListener('click', (e) => {
  if (e.target !== autopilotModal) return;
  dismissAutopilotModal();
});
for (const btn of autopilotModal.querySelectorAll<HTMLButtonElement>('.modal-close')) {
  btn.addEventListener('click', dismissAutopilotModal);
}

function parseAutopilotPrompt(text: string): MonsterKind | null {
  const lower = text.toLowerCase();
  if (lower.includes('skeleton')) return 'wild skeleton';
  if (
    lower.includes('goblin') ||
    lower.includes('monster') ||
    lower.includes('roam') ||
    lower.includes('kill') ||
    lower.includes('attack') ||
    lower.includes('punch') ||
    lower.includes('fight')
  ) {
    return 'wild goblin';
  }
  return null;
}

// No stopPropagation here — an earlier version called it unconditionally,
// which (since focus stayed on this input even after being hidden)
// silently swallowed EVERY subsequent keystroke, including WASD, before
// it ever reached Phaser's keyboard manager. The document-level listener
// (keyboard.ts) already ignores keys while a modal is open, so blocking
// propagation here was both redundant and the actual cause of "movement
// stopped working after using the prompt".
autopilotInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = autopilotInput.value.trim();
    hideModal(autopilotModal);
    updateInputCaptured();
    if (!text) return;
    const kind = parseAutopilotPrompt(text);
    if (!kind) {
      logCombatMessage(`Autopilot: didn't recognize "${text}" — try mentioning "wild goblin" or "wild skeleton".`);
      return;
    }
    activeScene?.startAutopilot(kind);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    dismissAutopilotModal();
  }
});
