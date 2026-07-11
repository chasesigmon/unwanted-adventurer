// A custom-driven tooltip instead of the native `title` attribute —
// description tooltips (skill names, inventory items, character-sheet
// stats) weren't reliably appearing at all, likely because a native
// tooltip needs the browser's own ~1-1.5s hover delay with the mouse held
// completely still, which reads as "there's no tooltip" in ordinary play.
// Shown near the cursor with a short, deliberate delay we control instead.
const customTooltip = document.createElement('div');
customTooltip.id = 'custom-tooltip';
customTooltip.hidden = true;
document.body.appendChild(customTooltip);

const TOOLTIP_SHOW_DELAY_MS = 300;
let tooltipShowTimer: ReturnType<typeof setTimeout> | null = null;

function positionTooltip(x: number, y: number): void {
  const offset = 14;
  const rect = customTooltip.getBoundingClientRect();
  let left = x + offset;
  let top = y + offset;
  if (left + rect.width > window.innerWidth) left = x - rect.width - offset;
  if (top + rect.height > window.innerHeight) top = y - rect.height - offset;
  customTooltip.style.left = `${Math.max(0, left)}px`;
  customTooltip.style.top = `${Math.max(0, top)}px`;
}

export function hideCustomTooltip(): void {
  if (tooltipShowTimer) {
    clearTimeout(tooltipShowTimer);
    tooltipShowTimer = null;
  }
  customTooltip.hidden = true;
}

// `getText` is called fresh on every hover (not captured once) so a
// dynamic tooltip (e.g. Eat Brains' remaining-cooldown count) stays
// accurate without needing its own bespoke hover wiring.
export function attachTooltip(el: HTMLElement, getText: () => string | undefined | null): void {
  el.addEventListener('mouseenter', (e) => {
    const x = (e as MouseEvent).clientX;
    const y = (e as MouseEvent).clientY;
    if (tooltipShowTimer) clearTimeout(tooltipShowTimer);
    tooltipShowTimer = setTimeout(() => {
      const text = getText();
      if (!text) return;
      customTooltip.textContent = text;
      customTooltip.hidden = false;
      positionTooltip(x, y);
    }, TOOLTIP_SHOW_DELAY_MS);
  });
  el.addEventListener('mousemove', (e) => {
    if (customTooltip.hidden) return;
    positionTooltip((e as MouseEvent).clientX, (e as MouseEvent).clientY);
  });
  el.addEventListener('mouseleave', hideCustomTooltip);
}
