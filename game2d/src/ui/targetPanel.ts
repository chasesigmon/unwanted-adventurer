// The small "currently targeted" HP panel — backs left-click targeting
// (see WorldScene's setTarget/clearTarget, the only callers).
const targetPanel = document.getElementById('target-panel') as HTMLDivElement;
const targetName = document.getElementById('target-name') as HTMLSpanElement;
const targetHpFill = document.getElementById('target-hp-fill') as HTMLDivElement;

export function updateTargetPanel(label: string, level: number, hp: number, maxHp: number): void {
  targetPanel.hidden = false;
  targetName.textContent = `${label} (Lv ${level})`;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  targetHpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
}

export function hideTargetPanel(): void {
  targetPanel.hidden = true;
}
