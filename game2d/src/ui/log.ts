// The combat/chat log panel — a single shared chronological stream
// (combat and chat lines appended to the SAME container in the order
// they actually happened, each tagged with which source it came from),
// its Combat/Chat tab filters, the chat input box, and the panel's
// drag-to-resize + persisted size/position (item 6).
import { network } from '../state.js';
import { setupCollapsible } from './collapsible.js';

const COMBAT_LOG_MAX_LINES = 60;

const logPanel = document.getElementById('log-panel') as HTMLDivElement;
const logToggle = document.getElementById('log-toggle') as HTMLButtonElement;
const logResizeHandle = document.getElementById('log-resize-handle') as HTMLDivElement;
const logView = document.getElementById('log-view') as HTMLDivElement;
export const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const logTabCombatBtn = document.getElementById('log-tab-combat') as HTMLButtonElement;
const logTabChatBtn = document.getElementById('log-tab-chat') as HTMLButtonElement;

setupCollapsible(logPanel, logToggle);

// ---------- Drag-resize (item 6: true two-axis resize + persistence) ----------

const LOG_PANEL_MIN_WIDTH = 260;
const LOG_PANEL_MIN_HEIGHT = 120;
const LOG_PANEL_SIZE_STORAGE_KEY = 'game2d:logPanelRect';

interface LogPanelRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function loadLogPanelRect(): LogPanelRect | null {
  try {
    const raw = localStorage.getItem(LOG_PANEL_SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LogPanelRect>;
    if (
      typeof parsed.top !== 'number' ||
      typeof parsed.left !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null;
    }
    return parsed as LogPanelRect;
  } catch {
    return null;
  }
}

function applyLogPanelRect(rect: LogPanelRect): void {
  // Switches from the CSS default's bottom-anchor to an explicit
  // top/left — see setupLogPanelResize's own comment for why an
  // explicit top is what makes the panel grow in the direction the user
  // actually drags, instead of upward against a fixed bottom edge.
  logPanel.style.top = `${rect.top}px`;
  logPanel.style.left = `${rect.left}px`;
  logPanel.style.bottom = 'auto';
  logPanel.style.width = `${rect.width}px`;
  logPanel.style.height = `${rect.height}px`;
}

function saveLogPanelRect(): void {
  const rect = logPanel.getBoundingClientRect();
  try {
    localStorage.setItem(
      LOG_PANEL_SIZE_STORAGE_KEY,
      JSON.stringify({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    );
  } catch {
    /* localStorage unavailable (private browsing etc.) — not worth surfacing */
  }
}

// A follow-up bug fix — the resize handle sits at the panel's own
// bottom-right corner; if a drag (or a previously-saved rect, restored
// below) ever let it end up spatially underneath the action bar (z-index
// 80, higher than this panel's 60), the action bar started intercepting
// every pointer event meant for the handle, permanently trapping the
// panel at that size with no way to grab the handle again. Clamps
// height so the panel's bottom edge stays clear of the action bar's own
// top edge whenever their horizontal spans would overlap.
const actionBar = document.getElementById('action-bar') as HTMLDivElement;
function clampHeightForActionBar(top: number, left: number, width: number, height: number): number {
  const barRect = actionBar.getBoundingClientRect();
  const horizontallyOverlaps = left < barRect.right && left + width > barRect.left;
  if (!horizontallyOverlaps) return height;
  return Math.max(LOG_PANEL_MIN_HEIGHT, Math.min(height, barRect.top - top - 8));
}

// Restores whatever size/position the player last dragged this panel to
// (item 6) — before any drag ever happens it just stays at the CSS
// default (bottom-left anchored, 220px tall). Re-clamped against the
// action bar every load too, so anyone already stuck from before this fix
// existed recovers on their next page load rather than staying trapped
// forever (a fresh drag can't happen if the handle's already unreachable).
const savedLogPanelRect = loadLogPanelRect();
if (savedLogPanelRect) {
  const clampedHeight = clampHeightForActionBar(savedLogPanelRect.top, savedLogPanelRect.left, savedLogPanelRect.width, savedLogPanelRect.height);
  const wasClamped = clampedHeight !== savedLogPanelRect.height;
  savedLogPanelRect.height = clampedHeight;
  applyLogPanelRect(savedLogPanelRect);
  if (wasClamped) saveLogPanelRect();
}

// Custom drag-resize instead of the native CSS `resize: both` handle —
// the panel STARTS anchored to the bottom-left of the screen (see
// #log-panel's `bottom`), and the native resize box only reliably grows
// in the direction away from whichever edges are actually anchored in
// every browser. Growing height while staying bottom-anchored technically
// still resizes the box (its top edge moves up) but the handle itself —
// glued to the panel's own bottom-right corner — never visually moves in
// that case, since the panel's bottom is pinned to the screen; dragging
// downward then looks like nothing happens even though the box really is
// taller. Switching to an explicit top/left anchor right when a drag
// starts fixes that: the bottom edge (and the handle sitting on it) now
// moves WITH the cursor in both directions.
(function setupLogPanelResize(): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  logResizeHandle.addEventListener('pointerdown', (e) => {
    dragging = true;
    const rect = logPanel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startWidth = rect.width;
    startHeight = rect.height;
    logPanel.style.top = `${rect.top}px`;
    logPanel.style.left = `${rect.left}px`;
    logPanel.style.bottom = 'auto';
    logResizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  logResizeHandle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.8;
    const width = Math.min(maxWidth, Math.max(LOG_PANEL_MIN_WIDTH, startWidth + (e.clientX - startX)));
    let height = Math.min(maxHeight, Math.max(LOG_PANEL_MIN_HEIGHT, startHeight + (e.clientY - startY)));
    const panelRect = logPanel.getBoundingClientRect();
    height = clampHeightForActionBar(panelRect.top, panelRect.left, width, height);
    logPanel.style.width = `${width}px`;
    logPanel.style.height = `${height}px`;
  });
  const stopDragging = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    logResizeHandle.releasePointerCapture(e.pointerId);
    saveLogPanelRect();
  };
  logResizeHandle.addEventListener('pointerup', stopDragging);
  logResizeHandle.addEventListener('pointercancel', stopDragging);
})();

// ---------- The shared chronological stream ----------

function appendLogLine(sourceKind: 'combat' | 'chat', text: string, kind?: 'level-up' | 'death'): void {
  const line = document.createElement('div');
  line.className = kind ? `log-line log-line-${sourceKind} ${kind}` : `log-line log-line-${sourceKind}`;
  line.textContent = text;
  logView.appendChild(line);
  while (logView.childElementCount > COMBAT_LOG_MAX_LINES) {
    logView.removeChild(logView.firstChild as ChildNode);
  }
  logView.scrollTop = logView.scrollHeight;
}

export function logCombatMessage(message: string, kind?: 'level-up' | 'death'): void {
  appendLogLine('combat', message, kind);
}

export function logChatMessage(username: string, message: string): void {
  appendLogLine('chat', `${username}: ${message}`);
}

// Combat and Chat are independently toggleable — either or both can be
// visible, but turning the last visible one off is refused (at least one
// must always stay up). Filtering (not separate storage) is what makes
// the single fluid ordering above possible.
let combatTabVisible = true;
let chatTabVisible = false;

function updateLogTabsView(): void {
  logTabCombatBtn.classList.toggle('active', combatTabVisible);
  logTabChatBtn.classList.toggle('active', chatTabVisible);
  logPanel.classList.toggle('hide-combat', !combatTabVisible);
  logPanel.classList.toggle('hide-chat', !chatTabVisible);
  // The chat input only makes sense while the chat pane itself is
  // visible — hiding the Chat tab hides its input along with it.
  if (!chatTabVisible) chatInput.hidden = true;
}

export function setLogTabVisible(tab: 'combat' | 'chat', visible: boolean): void {
  if (!visible) {
    const otherVisible = tab === 'combat' ? chatTabVisible : combatTabVisible;
    if (!otherVisible) return; // refused — at least one tab must stay active
  }
  if (tab === 'combat') combatTabVisible = visible;
  else chatTabVisible = visible;
  updateLogTabsView();
}

// Auto-shows the Combat tab exactly once at the START of a fight (if it
// wasn't already visible) — not on every single exchange, and never
// hides Chat to do it (both can be up at once). A "fight" is considered
// over (so the NEXT punch counts as a new start) after a few seconds of
// no combat activity.
const COMBAT_SESSION_IDLE_MS = 8000;
let combatSessionActive = false;
let combatSessionTimer: ReturnType<typeof setTimeout> | null = null;

export function noteCombatActivity(): void {
  if (!combatSessionActive) {
    combatSessionActive = true;
    setLogTabVisible('combat', true);
  }
  if (combatSessionTimer) clearTimeout(combatSessionTimer);
  combatSessionTimer = setTimeout(() => {
    combatSessionActive = false;
  }, COMBAT_SESSION_IDLE_MS);
}

logTabCombatBtn.addEventListener('click', () => setLogTabVisible('combat', !combatTabVisible));
logTabChatBtn.addEventListener('click', () => setLogTabVisible('chat', !chatTabVisible));
updateLogTabsView();

// Pressing Enter anywhere (outside a modal/another input) reveals and
// focuses the chat box — matching the text game's own "press Enter to
// chat" convention. Typing in it doesn't fight Phaser's global keyboard
// capture for the same reason the autopilot prompt doesn't (see
// modalCore.ts's updateInputCaptured) — focus/blur toggle it directly
// since the chat box isn't one of the ALL_MODALS.
export let chatInputFocused = false;
export function openChatInput(): void {
  setLogTabVisible('chat', true);
  chatInput.hidden = false;
  chatInput.focus();
}
// Pre-fills arbitrary text instead of leaving the chat box empty — used
// both by the "/" shortcut (just the slash) and by the action bar's
// mimic skill ("/mimic " — it needs a target name typed in, unlike
// revert which takes none and fires immediately).
export function openChatInputWithText(text: string): void {
  setLogTabVisible('chat', true);
  chatInput.hidden = false;
  chatInput.value = text;
  chatInput.focus();
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
}
export function openChatInputWithSlash(): void {
  openChatInputWithText('/');
}

// Registered by modalCore.ts (which owns the broader updateInputCaptured
// logic) so focusing/blurring the chat box also recomputes it — passed
// in rather than imported directly to avoid a circular import between
// log.ts and modalCore.ts.
export function registerChatFocusListener(onFocusChange: () => void): void {
  chatInput.addEventListener('focus', () => {
    chatInputFocused = true;
    onFocusChange();
  });
  chatInput.addEventListener('blur', () => {
    chatInputFocused = false;
    onFocusChange();
  });
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = chatInput.value.trim();
    chatInput.value = '';
    if (text) network.chat(text);
    chatInput.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    chatInput.blur();
  }
});

// Clicking anywhere outside the chat box (the game canvas, a corner
// button, ...) takes focus away from it too, not just sending a message.
document.addEventListener('mousedown', (e) => {
  if (chatInputFocused && e.target !== chatInput) chatInput.blur();
});
