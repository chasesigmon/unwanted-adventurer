// A small, dark, semi-transparent center-screen toast (item 1) for
// skill/spell growth and newly-learned (or already-learned) abilities —
// these used to only ever show up as one line among many in the combat
// log, easy to miss during a fight. Multiple toasts stack vertically and
// each fades out on its own after a few seconds.
const TOAST_DURATION_MS = 2600;
const TOAST_FADE_MS = 400;

const container = document.createElement('div');
container.id = 'center-toast-container';
document.body.appendChild(container);

// Guarantees the required "message with an '!' at the end" shape
// regardless of the exact wording a call site passes in, rather than
// relying on every server message being hand-formatted consistently.
function withExclamation(message: string): string {
  const trimmed = message.trim();
  return trimmed.endsWith('!') ? trimmed : `${trimmed}!`;
}

export function showCenterToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'center-toast';
  toast.textContent = withExclamation(message);
  container.appendChild(toast);

  // Next frame, so the initial (pre-transition) state actually paints
  // before switching to the visible state — otherwise the browser can
  // coalesce both style changes into one and skip the fade-in entirely.
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }, TOAST_DURATION_MS);
}

// Splits a possibly multi-line (newline-joined) message into one toast
// per line — server messages that bundle several notices together (a
// skill grant alongside an evolution notice, say) read better as
// separate stacked toasts than one crammed multi-line box.
export function showCenterToastLines(message: string): void {
  for (const line of message.split('\n')) {
    if (line.trim()) showCenterToast(line);
  }
}
