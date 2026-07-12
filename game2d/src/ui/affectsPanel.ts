// The Affects modal (a follow-up ask) — shows every timed spell
// currently active on the player and how much longer it has (e.g.
// "Lucem - 2m"), refreshed live once a second while the modal stays
// open rather than only when it's first opened, so the countdown
// actually counts down instead of showing a stale snapshot.
import { myProfile } from '../state.js';
import { affectsBody, affectsModal, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';

interface ActiveAffect {
  label: string;
  // Absent for a state with no fixed expiry (sleeping/resting — a later
  // follow-up ask: "while sleeping or resting or sitting also show in the
  // affects window the respective message") — rendered with no
  // countdown at all rather than a fake one.
  expiresAt?: number;
}

function activeAffects(): ActiveAffect[] {
  if (!myProfile) return [];
  const affects: ActiveAffect[] = [];
  if (myProfile.wandLit && myProfile.wandLitUntil) affects.push({ label: 'Lucem', expiresAt: myProfile.wandLitUntil });
  if (myProfile.celeritasActive && myProfile.celeritasActiveUntil) {
    affects.push({ label: 'Celeritas', expiresAt: myProfile.celeritasActiveUntil });
  }
  if (myProfile.scutumActive && myProfile.scutumActiveUntil) {
    affects.push({ label: 'Scutum', expiresAt: myProfile.scutumActiveUntil });
  }
  // A later follow-up ask — restState has no fixed duration at all (the
  // player wakes/stands up whenever they choose), so these never carry an
  // expiresAt.
  if (myProfile.restState === 'sleeping') {
    affects.push({ label: myProfile.sleepingInBed ? 'Sleeping in a bed' : 'Sleeping' });
  } else if (myProfile.restState === 'resting') {
    affects.push({ label: 'Resting' });
  }
  return affects;
}

// "2m" for anything a minute or more out, "30s" under that — matches the
// request's own "Lucem - 2m" example.
function formatRemaining(expiresAt: number): string {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  if (remainingMs >= 60_000) return `${Math.ceil(remainingMs / 60_000)}m`;
  return `${Math.ceil(remainingMs / 1000)}s`;
}

export function renderAffects(): void {
  affectsBody.innerHTML = '';
  const affects = activeAffects();
  if (affects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stat-label';
    empty.textContent = 'Nothing active right now.';
    affectsBody.appendChild(empty);
    return;
  }
  for (const { label, expiresAt } of affects) {
    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = expiresAt !== undefined ? formatRemaining(expiresAt) : '';
    affectsBody.appendChild(labelEl);
    affectsBody.appendChild(valueEl);
  }
}

registerModalOpenHandler(affectsModal, renderAffects);
registerModalRefreshHandler(affectsModal, renderAffects);

// A plain 1s ticker — cheap (a handful of DOM text nodes) and only
// matters visually while the modal is actually open, so no need to gate
// it behind anything fancier than the same `hidden` check every other
// modal already uses.
setInterval(() => {
  if (!affectsModal.hidden) renderAffects();
}, 1000);
