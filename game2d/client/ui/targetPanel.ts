// The small "currently targeted" HP panel — backs left-click targeting
// (see WorldScene's setTarget/clearTarget, the only callers).
const targetPanel = document.getElementById('target-panel') as HTMLDivElement;
const targetName = document.getElementById('target-name') as HTMLSpanElement;
const targetHpBar = document.getElementById('target-hp-bar') as HTMLDivElement;
const targetHpFill = document.getElementById('target-hp-fill') as HTMLDivElement;
const groupPanelEl = document.getElementById('group-panel') as HTMLDivElement;

const TARGET_PANEL_BASE_TOP = 50;
const TARGET_PANEL_GAP = 10;

// A follow-up bug fix: "the labels are still overlapping — the monster
// selection label should be below the follower/group label." The group
// panel's own height used to be assumed small and fixed (a hardcoded
// `top: 100px` on #target-panel), but it can now show a pet AND up to 2
// animated monsters, each with its own hp bar/exp/commands/carried
// items — often much taller than that fixed guess. Recomputed from the
// group panel's own REAL rendered height every time either panel
// changes, rather than guessing a constant offset.
export function repositionTargetPanel(): void {
  targetPanel.style.top = groupPanelEl.hidden
    ? `${TARGET_PANEL_BASE_TOP}px`
    : `${groupPanelEl.offsetTop + groupPanelEl.offsetHeight + TARGET_PANEL_GAP}px`;
}

export function updateTargetPanel(label: string, level: number, hp: number, maxHp: number): void {
  targetPanel.hidden = false;
  targetHpBar.hidden = false;
  targetName.textContent = `${label} (Lv ${level})`;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  targetHpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  repositionTargetPanel();
}

// A door/chest "target" (a later follow-up ask) — same top-left panel a
// monster's own selection uses, just without a health bar (doors/chests
// have no hp to show), used by WorldScene's lockTarget selection.
export function updateLockTargetPanel(label: string): void {
  targetPanel.hidden = false;
  targetHpBar.hidden = true;
  targetName.textContent = label;
  repositionTargetPanel();
}

export function hideTargetPanel(): void {
  targetPanel.hidden = true;
}
