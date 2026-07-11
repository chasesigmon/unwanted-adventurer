// Shared by the status bar and the combat/chat log panel — a small "−"
// toggle that collapses a panel down to just its header.
export function setupCollapsible(panel: HTMLElement, toggle: HTMLButtonElement): void {
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '+' : '−';
  });
}
