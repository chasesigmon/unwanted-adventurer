// Item 3: fully customizable, multi-position action bar system —
// replaces the old single hardcoded 20-slot bottom bar (formerly
// client/ui/actionBar.ts). A player can now create any number of bars
// (up to one per anchor position: top/right/bottom/left, all "-middle"),
// each independently collapsible, sized (rows x cols), and with a
// per-slot customizable hotkey (including modifiers) — configured via the
// Settings modal's own Action Bars tab (see settingsModal.ts).
import { activeScene, myProfile } from '../state.js';
import { createCooldownOverlay, isAttackSkill, skillIconColor, updateCooldownOverlay } from './skillMeta.js';
import { skillIconGlyphUrl } from './skillIcons.js';
import { attachTooltip } from './tooltip.js';

// ---------- Drag visuals (unchanged from the old single-bar system —
// shared by the Skills modal's own drag source and slot-to-slot dragging
// below; not bar-specific) ----------

const TRANSPARENT_DRAG_IMAGE = new Image();
TRANSPARENT_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
let floatingDragClone: HTMLElement | null = null;

function positionDragClone(x: number, y: number): void {
  if (!floatingDragClone) return;
  floatingDragClone.style.left = `${x}px`;
  floatingDragClone.style.top = `${y}px`;
}

export function beginDragVisual(e: DragEvent, sourceEl: HTMLElement): void {
  e.dataTransfer?.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
  floatingDragClone?.remove();
  floatingDragClone = sourceEl.cloneNode(true) as HTMLElement;
  floatingDragClone.classList.add('drag-floating-clone');
  document.body.appendChild(floatingDragClone);
  positionDragClone(e.clientX, e.clientY);
}

export function updateDragVisual(e: DragEvent): void {
  if (e.clientX === 0 && e.clientY === 0) return;
  positionDragClone(e.clientX, e.clientY);
}

export function endDragVisual(): void {
  floatingDragClone?.remove();
  floatingDragClone = null;
}

// ---------- Config ----------

export type ActionBarPosition = 'top' | 'right' | 'bottom' | 'left';
export const ACTION_BAR_POSITIONS: ActionBarPosition[] = ['top', 'right', 'bottom', 'left'];
export const ACTION_BAR_POSITION_LABELS: Record<ActionBarPosition, string> = {
  top: 'Top middle',
  right: 'Right middle',
  bottom: 'Bottom middle',
  left: 'Left middle',
};

// A follow-up ask ("after adding more action bars on the left and right,
// I was not able to adjust their rows, only their columns") — a
// side-docked bar's own sensible default (see addActionBar below) used to
// START at the row cap (4), so the Settings modal's rows stepper had
// nowhere to go but down, reading as "broken." Rows/cols now share the
// same 1-10 range regardless of dock side, so there's always headroom in
// both directions no matter which default a bar started from.
export const ACTION_BAR_MIN_ROWS = 1;
export const ACTION_BAR_MAX_ROWS = 10;
export const ACTION_BAR_MIN_COLS = 1;
export const ACTION_BAR_MAX_COLS = 10;

export interface ActionBarSlotConfig {
  skill: string | null;
  // A combo string like "Digit1" or "shift+Digit1" or "ctrl+KeyQ" — built
  // from KeyboardEvent.code (not .key, so Shift+1 stays distinguishable
  // from '!' on a US layout — same convention the old fixed digit-key
  // shortcuts used) plus any of shift/ctrl/alt, always in that order.
  hotkey: string | null;
}

export interface ActionBarConfig {
  id: string;
  position: ActionBarPosition;
  rows: number;
  cols: number;
  collapsed: boolean;
  slots: ActionBarSlotConfig[];
}

function emptySlot(): ActionBarSlotConfig {
  return { skill: null, hotkey: null };
}

// The legacy single bar's own default hotkeys (1-9,0 then Shift+1-9,0 for
// the second row) — reapplied to a freshly-created default bar (both for
// a migrated old bar and a genuinely brand-new player) so out-of-the-box
// behavior doesn't regress just because the bar is now one of several
// possible ones instead of the only one.
const LEGACY_DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
function legacyDefaultHotkey(index: number): string | null {
  if (index < 10) return LEGACY_DIGIT_CODES[index]!;
  if (index < 20) return `shift+${LEGACY_DIGIT_CODES[index - 10]!}`;
  return null;
}

function defaultBar(): ActionBarConfig {
  const rows = 2;
  const cols = 10;
  const slots = Array.from({ length: rows * cols }, (_, i) => ({ skill: null, hotkey: legacyDefaultHotkey(i) }));
  return { id: 'default', position: 'bottom', rows, cols, collapsed: false, slots };
}

let bars: ActionBarConfig[] = [];

function actionBarsStorageKey(username: string): string {
  return `game2d:actionBars:${username}`;
}

// Pre-item-3 storage keys — migrated into a single default bottom bar the
// first time a returning player's config is loaded, so nobody's existing
// loadout silently vanishes just because the storage format changed.
function legacyStorageKeys(username: string): { skills: string; collapsed: string } {
  return { skills: `game2d:actionBar:${username}`, collapsed: `game2d:actionBarCollapsed:${username}` };
}

function migrateLegacyBar(username: string): ActionBarConfig | null {
  try {
    const raw = localStorage.getItem(legacyStorageKeys(username).skills);
    if (!raw) return null;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return null;
    const bar = defaultBar();
    for (let i = 0; i < bar.slots.length; i++) {
      const skillName = saved[i];
      if (typeof skillName === 'string') bar.slots[i]!.skill = skillName;
    }
    bar.collapsed = localStorage.getItem(legacyStorageKeys(username).collapsed) === 'true';
    return bar;
  } catch {
    return null;
  }
}

function saveActionBarsToStorage(username: string): void {
  try {
    localStorage.setItem(actionBarsStorageKey(username), JSON.stringify(bars));
  } catch {
    /* localStorage unavailable (private browsing etc.) — not worth surfacing */
  }
}

export function saveActionBars(): void {
  if (!myProfile) return;
  saveActionBarsToStorage(myProfile.username);
}

export function getActionBars(): ActionBarConfig[] {
  return bars;
}

export function getActionBar(barId: string): ActionBarConfig | undefined {
  return bars.find((b) => b.id === barId);
}

let actionBarsLoadedForUsername: string | null = null;
export function loadActionBarsOnce(username: string): void {
  if (actionBarsLoadedForUsername === username) return;
  actionBarsLoadedForUsername = username;
  try {
    const raw = localStorage.getItem(actionBarsStorageKey(username));
    if (raw) {
      const saved = JSON.parse(raw) as unknown;
      if (Array.isArray(saved) && saved.length > 0) {
        bars = saved as ActionBarConfig[];
        renderAllActionBars();
        return;
      }
    }
  } catch {
    /* corrupt/missing data — fall through to migration/default below */
  }
  const migrated = migrateLegacyBar(username);
  bars = [migrated ?? defaultBar()];
  saveActionBarsToStorage(username);
  renderAllActionBars();
}

// ---------- Slot lookup/assignment (used by skillsPanel.ts's drag/
// double-click/shift-click, generalized to search across every bar) ----------

export function findActionBarSlot(predicate: (skill: string) => boolean): { barId: string; index: number } | null {
  for (const bar of bars) {
    const index = bar.slots.findIndex((s) => s.skill !== null && predicate(s.skill));
    if (index !== -1) return { barId: bar.id, index };
  }
  return null;
}

export function findFreeActionBarSlot(): { barId: string; index: number } | null {
  for (const bar of bars) {
    const index = bar.slots.findIndex((s) => s.skill === null);
    if (index !== -1) return { barId: bar.id, index };
  }
  return null;
}

export function assignActionBarSlot(barId: string, index: number, skillName: string): void {
  const bar = getActionBar(barId);
  if (!bar || !bar.slots[index]) return;
  // Punch and dagger share one "Attack" slot — assigning either one bumps
  // whichever OTHER slot (in ANY bar) currently holds the other, rather
  // than allowing two at once.
  if (isAttackSkill(skillName)) {
    for (const other of bars) {
      other.slots.forEach((s, j) => {
        if (!(other.id === barId && j === index) && s.skill !== null && isAttackSkill(s.skill)) {
          s.skill = null;
          renderSlot(other.id, j);
        }
      });
    }
  }
  bar.slots[index]!.skill = skillName;
  renderSlot(barId, index);
}

export function removeSkillFromActionBars(skillName: string): boolean {
  let removed = false;
  for (const bar of bars) {
    bar.slots.forEach((s, j) => {
      if (s.skill === skillName) {
        s.skill = null;
        removed = true;
        renderSlot(bar.id, j);
      }
    });
  }
  if (removed) saveActionBars();
  return removed;
}

export function triggerActionBarSlot(barId: string, index: number): void {
  const bar = getActionBar(barId);
  const skillName = bar?.slots[index]?.skill;
  if (skillName) activeScene?.useTargetedSkill(skillName);
}

// A keydown's own combo string, same shift/ctrl/alt-then-code order every
// stored hotkey uses (see ActionBarSlotConfig.hotkey's own doc comment).
export function comboForKeyboardEvent(e: KeyboardEvent): string {
  let combo = '';
  if (e.shiftKey) combo += 'shift+';
  if (e.ctrlKey) combo += 'ctrl+';
  if (e.altKey) combo += 'alt+';
  return combo + e.code;
}

// Checked from keyboard.ts's own global handler — returns whether a bound
// slot was actually found and triggered (so the caller knows whether to
// preventDefault/treat the key as "handled").
export function triggerHotkeyIfBound(combo: string): boolean {
  for (const bar of bars) {
    const index = bar.slots.findIndex((s) => s.hotkey === combo);
    if (index !== -1) {
      triggerActionBarSlot(bar.id, index);
      return true;
    }
  }
  return false;
}

// ---------- Bar management (used by settingsModal.ts) ----------

export function addActionBar(position: ActionBarPosition): boolean {
  if (bars.some((b) => b.position === position)) return false;
  // A left/right-docked bar reads top-to-bottom, so it defaults to a
  // narrow-and-tall shape instead of the wide 2x10 that suits top/bottom
  // docking — purely a starting point, both dimensions stay adjustable
  // from the Settings modal afterward either way. Deliberately NOT
  // ACTION_BAR_MAX_ROWS here — starting already pinned at the cap left no
  // room to adjust rows upward at all, reading as "the rows stepper is
  // broken" (a follow-up ask) even though it worked, just only downward.
  const isSideDocked = position === 'left' || position === 'right';
  const rows = isSideDocked ? 5 : 2;
  const cols = isSideDocked ? 2 : 5;
  bars.push({
    id: `bar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    position,
    rows,
    cols,
    collapsed: false,
    slots: Array.from({ length: rows * cols }, emptySlot),
  });
  saveActionBars();
  renderAllActionBars();
  return true;
}

export function removeActionBar(barId: string): void {
  bars = bars.filter((b) => b.id !== barId);
  saveActionBars();
  renderAllActionBars();
}

export function resizeActionBar(barId: string, rows: number, cols: number): void {
  const bar = getActionBar(barId);
  if (!bar) return;
  rows = Math.max(ACTION_BAR_MIN_ROWS, Math.min(ACTION_BAR_MAX_ROWS, rows));
  cols = Math.max(ACTION_BAR_MIN_COLS, Math.min(ACTION_BAR_MAX_COLS, cols));
  const newSlots = Array.from({ length: rows * cols }, (_, i) => bar.slots[i] ?? emptySlot());
  bar.rows = rows;
  bar.cols = cols;
  bar.slots = newSlots;
  saveActionBars();
  renderAllActionBars();
}

// Returns whether an EXISTING binding elsewhere had to be removed to make
// room for this one (a follow-up ask: "allow the mapping update but show
// a tooltip message that the old mapping has been removed") — the caller
// (settingsModal.ts) uses this to decide whether to surface that toast;
// setActionBarHotkey itself stays silent either way.
export function setActionBarHotkey(barId: string, index: number, combo: string | null): boolean {
  const bar = getActionBar(barId);
  if (!bar || !bar.slots[index]) return false;
  // A hotkey can only ever trigger one slot — stealing it from wherever
  // else it was bound (any bar) avoids a silently-ambiguous double binding.
  let stolen = false;
  if (combo) {
    for (const other of bars) {
      other.slots.forEach((s) => {
        if (s.hotkey === combo && !(other.id === barId && other.slots.indexOf(s) === index)) {
          s.hotkey = null;
          stolen = true;
        }
      });
    }
  }
  bar.slots[index]!.hotkey = combo;
  saveActionBars();
  return stolen;
}

export function toggleActionBarCollapsed(barId: string): void {
  const bar = getActionBar(barId);
  if (!bar) return;
  bar.collapsed = !bar.collapsed;
  saveActionBars();
  renderBarCollapsedState(barId);
}

// ---------- Rendering ----------

const root = document.getElementById('action-bars-root') as HTMLDivElement;
const barWrappers = new Map<string, HTMLDivElement>();
const barGrids = new Map<string, HTMLDivElement>();
const barToggles = new Map<string, HTMLButtonElement>();
const slotElements = new Map<string, HTMLDivElement>();

function slotKey(barId: string, index: number): string {
  return `${barId}:${index}`;
}

const ACTION_SLOT_SOURCE_MIME = 'application/x-action-slot-source';

function renderSlot(barId: string, index: number): void {
  const bar = getActionBar(barId);
  const el = slotElements.get(slotKey(barId, index));
  if (!bar || !el) return;
  const skillName = bar.slots[index]?.skill ?? null;
  el.classList.toggle('filled', skillName !== null);
  el.draggable = skillName !== null;
  const overlay = el.querySelector<HTMLElement>('.cooldown-overlay')!;
  el.textContent = '';
  el.appendChild(overlay); // textContent= above wipes children too — re-append
  if (skillName) {
    el.style.background = skillIconColor(skillName);
    el.style.backgroundImage = skillIconGlyphUrl(skillName);
    el.style.backgroundSize = '60%';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    overlay.dataset.skill = skillName;
  } else {
    el.style.background = '';
    el.style.backgroundImage = '';
    delete overlay.dataset.skill;
  }
  updateCooldownOverlay(overlay);
}

function renderBarCollapsedState(barId: string): void {
  const bar = getActionBar(barId);
  const grid = barGrids.get(barId);
  const toggle = barToggles.get(barId);
  if (!bar || !grid || !toggle) return;
  grid.classList.toggle('collapsed', bar.collapsed);
  const glyphs: Record<ActionBarPosition, [string, string]> = {
    top: ['▾', '▴'],
    bottom: ['▴', '▾'],
    left: ['▸', '◂'],
    right: ['◂', '▸'],
  };
  const [expandedGlyph, collapsedGlyph] = glyphs[bar.position];
  toggle.textContent = bar.collapsed ? expandedGlyph : collapsedGlyph;
  toggle.title = bar.collapsed ? 'Expand action bar' : 'Collapse action bar';
}

function buildSlotElement(barId: string, index: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'action-slot';
  el.appendChild(createCooldownOverlay(''));
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const skillName = e.dataTransfer?.getData('text/plain');
    if (!skillName) return;
    const sourceRaw = e.dataTransfer?.getData(ACTION_SLOT_SOURCE_MIME);
    const source = sourceRaw ? (JSON.parse(sourceRaw) as { barId: string; index: number }) : null;
    const bar = getActionBar(barId);
    if (!bar) return;
    // Dropping one filled slot onto another should SWAP them, not
    // silently delete whatever was already sitting in the destination —
    // captured before assignActionBarSlot below overwrites it.
    const previousInDest = bar.slots[index]?.skill ?? null;

    assignActionBarSlot(barId, index, skillName);
    // Dragging in from ANOTHER slot (in any bar) is a move, not a copy —
    // clear wherever it came from (unless dropped back onto itself),
    // putting whatever WAS in the destination slot there instead of just
    // discarding it.
    if (source && (source.barId !== barId || source.index !== index)) {
      const sourceBar = getActionBar(source.barId);
      if (sourceBar && sourceBar.slots[source.index]?.skill === skillName) {
        if (previousInDest && previousInDest !== skillName) {
          assignActionBarSlot(source.barId, source.index, previousInDest);
        } else {
          sourceBar.slots[source.index]!.skill = null;
          renderSlot(source.barId, source.index);
        }
      }
    }
    saveActionBars();
  });
  el.addEventListener('dragstart', (e) => {
    const bar = getActionBar(barId);
    const skillName = bar?.slots[index]?.skill;
    if (!skillName) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', skillName);
    e.dataTransfer?.setData(ACTION_SLOT_SOURCE_MIME, JSON.stringify({ barId, index }));
    beginDragVisual(e, el);
  });
  el.addEventListener('drag', updateDragVisual);
  el.addEventListener('dragend', (e) => {
    endDragVisual();
    const bar = getActionBar(barId);
    if (e.dataTransfer?.dropEffect === 'none' && bar?.slots[index]?.skill !== null) {
      if (bar) {
        bar.slots[index]!.skill = null;
        renderSlot(barId, index);
        saveActionBars();
      }
    }
  });
  el.addEventListener('click', () => triggerActionBarSlot(barId, index));
  attachTooltip(el, () => {
    const bar = getActionBar(barId);
    const slot = bar?.slots[index];
    if (!slot?.skill) return undefined;
    return slot.hotkey ? `${slot.skill} (${slot.hotkey.replace('shift+', 'Shift+').replace(/Digit/, '')})` : slot.skill;
  });
  slotElements.set(slotKey(barId, index), el);
  return el;
}

function buildBarWrapper(bar: ActionBarConfig): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = `action-bar-wrapper pos-${bar.position}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'action-bar-toggle';
  toggle.addEventListener('click', () => toggleActionBarCollapsed(bar.id));
  barToggles.set(bar.id, toggle);

  const grid = document.createElement('div');
  grid.className = 'action-bar-grid';
  barGrids.set(bar.id, grid);

  wrapper.appendChild(toggle);
  wrapper.appendChild(grid);
  barWrappers.set(bar.id, wrapper);
  return wrapper;
}

// Full teardown + rebuild — simplest correct approach given bars can be
// added/removed/resized from the Settings modal at any time; this project
// has no virtual-DOM diffing anywhere else either, and an action bar is
// small enough that a full rebuild is imperceptible.
export function renderAllActionBars(): void {
  root.innerHTML = '';
  barWrappers.clear();
  barGrids.clear();
  barToggles.clear();
  slotElements.clear();

  for (const bar of bars) {
    const wrapper = buildBarWrapper(bar);
    const grid = barGrids.get(bar.id)!;
    grid.style.gridTemplateColumns = `repeat(${bar.cols}, 36px)`;
    grid.style.gridTemplateRows = `repeat(${bar.rows}, 36px)`;
    for (let i = 0; i < bar.slots.length; i++) {
      const el = buildSlotElement(bar.id, i);
      grid.appendChild(el);
      renderSlot(bar.id, i);
    }
    renderBarCollapsedState(bar.id);
    root.appendChild(wrapper);
  }
}
