// The Affects modal (a follow-up ask) — shows every timed spell
// currently active on the player and how much longer it has (e.g.
// "Lucem - 2m"), refreshed live once a second while the modal stays
// open rather than only when it's first opened, so the countdown
// actually counts down instead of showing a stale snapshot.
import { myProfile } from '../state.js';
import { isNearBench } from '../../shared/lighting.js';
import { isFlyingBeastKind } from '../../shared/constants.js';
import { affectsBody, affectsModal, registerModalOpenHandler, registerModalRefreshHandler } from './modalCore.js';
import { attachTooltip } from './tooltip.js';

// Mirrors game.gateway.ts's own STAT_TICK_MS — "12 game hours (ticks)"
// (the Learn Spells quest's own enhanced-learning reward) means 12 stat
// ticks, each this many ms apart, not 12 real-world hours.
const STAT_TICK_MS = 30_000;

interface ActiveAffect {
  label: string;
  // Absent for a state with no fixed expiry (sleeping/resting — a later
  // follow-up ask: "while sleeping or resting or sitting also show in the
  // affects window the respective message") — rendered with no
  // countdown at all rather than a fake one.
  expiresAt?: number;
  // Item 11's Transform spell (a later follow-up ask): "show a tooltip
  // message that they are flying" — optional since every other existing
  // affect here is self-explanatory from its label alone.
  tooltip?: string;
}

function activeAffects(): ActiveAffect[] {
  if (!myProfile) return [];
  const affects: ActiveAffect[] = [];
  // A later follow-up ask: "the Affects window still uses Latin names —
  // remove ALL Latin references everywhere." These 3 labels were the last
  // holdouts from an earlier rename pass that already renamed every
  // spell's own skill key to English (shared/skills.ts's LIGHT_SKILL=
  // 'light', HASTE_SKILL='haste', AEGIS_SKILL='aegis') but never touched
  // these hardcoded Affects labels, so the Skills panel/action bar and the
  // Affects window showed two different names for the same spell.
  if (myProfile.wandLit && myProfile.wandLitUntil) affects.push({ label: 'Light', expiresAt: myProfile.wandLitUntil });
  if (myProfile.celeritasActive && myProfile.celeritasActiveUntil) {
    affects.push({ label: 'Haste', expiresAt: myProfile.celeritasActiveUntil });
  }
  if (myProfile.scutumActive && myProfile.scutumActiveUntil) {
    affects.push({ label: 'Aegis', expiresAt: myProfile.scutumActiveUntil });
  }
  if (myProfile.barrierActive && myProfile.barrierActiveUntil) {
    affects.push({ label: 'Barrier', expiresAt: myProfile.barrierActiveUntil });
  }
  if (myProfile.enhanceDamageActive && myProfile.enhanceDamageActiveUntil) {
    affects.push({ label: 'Enhance Damage', expiresAt: myProfile.enhanceDamageActiveUntil });
  }
  if (myProfile.invisibleActive && myProfile.invisibleActiveUntil) {
    affects.push({ label: 'Invisibility', expiresAt: myProfile.invisibleActiveUntil });
  }
  if (myProfile.wispActive && myProfile.wispActiveUntil) {
    affects.push({ label: 'Wisp Transformation', expiresAt: myProfile.wispActiveUntil });
  }
  // A later follow-up ask: "while druid has wisp transformation active
  // (flight is possible), also add a flight AFFECT matching wisp
  // transformation's own time limit." Wisp already grants real
  // water-crossing flight via shared/constants.ts's own isEffectivelyFlying
  // (its wispActive branch) — this was purely a missing UI gap, so it's a
  // second synthetic 'Flight' row keyed off wispActiveUntil rather than
  // touching the real flightActive/flightActiveUntil server fields (which
  // would risk clobbering an independently-cast real Flight spell's own
  // duration on wisp's expiry). If BOTH are independently active at once
  // (a real Flight cast during wisp), show a single row using whichever
  // expires later, rather than two identical "Flight" rows.
  const realFlightUntil = myProfile.flightActive ? myProfile.flightActiveUntil : null;
  const wispFlightUntil = myProfile.wispActive ? myProfile.wispActiveUntil : null;
  if (realFlightUntil || wispFlightUntil) {
    const expiresAt = Math.max(realFlightUntil ?? 0, wispFlightUntil ?? 0);
    affects.push({ label: 'Flight', expiresAt });
  }
  // Item 11's Transform spell (a later follow-up ask): "put an affect in
  // the affects window that they are flying ('Flying - Indefinitely')" —
  // tied to the transform's own (already-shown-elsewhere) duration, not a
  // separate timer of its own, so baked into the label like "Enhanced
  // learning - Xh" above rather than given its own expiresAt countdown.
  if (myProfile.beastTransformActive && isFlyingBeastKind(myProfile.beastTransformKind)) {
    affects.push({
      label: 'Flying - Indefinitely',
      tooltip: 'Transformed into a flying beast — you can cross water freely and move faster while transformed.',
    });
  }
  // The flight spell's own spacebar burst (a later follow-up ask: "show
  // this secondary 10 second cooldown somewhere relevant so the player
  // knows when it is done") — only shown WHILE actually on cooldown, same
  // "appears only when it matters" convention a skill's own SKILL_COOLDOWN_MS
  // overlay uses, rather than a permanent "ready"/"Xs" row.
  if (myProfile.flightBurstReadyAt && myProfile.flightBurstReadyAt > Date.now()) {
    affects.push({ label: 'Flight Burst', expiresAt: myProfile.flightBurstReadyAt });
  }
  // The Illusionist's own create duplicate (a later follow-up ask) — no
  // separate xActive boolean, purely time-based like enhancedLearningUntil
  // below (no manual early-cancel exists for this one).
  if (myProfile.duplicateActiveUntil && myProfile.duplicateActiveUntil > Date.now()) {
    affects.push({ label: 'Duplicate', expiresAt: myProfile.duplicateActiveUntil });
  }
  // A later follow-up ask — restState has no fixed duration at all (the
  // player wakes/stands up whenever they choose), so these never carry an
  // expiresAt.
  if (myProfile.restState === 'sleeping') {
    affects.push({ label: myProfile.sleepingInBed ? 'Sleeping in a bed' : 'Sleeping' });
  } else if (myProfile.restState === 'resting') {
    // A follow-up ask: "if a player sits or rests on one of the benches...
    // show it in the affects window: 'Enhanced resting on a bench'" —
    // replaces the plain "Resting" label rather than showing both.
    affects.push({ label: isNearBench(myProfile.map, myProfile.row, myProfile.col) ? 'Enhanced resting on a bench' : 'Resting' });
  }
  // The Learn Spells quest's own completion reward (a follow-up ask) —
  // shown as "Enhanced learning - Xh" (hours = stat ticks remaining, not
  // the usual "2m"/"30s" wall-clock format below, since the ask
  // specifically wants it in hours) rather than a countdown value column.
  if (myProfile.enhancedLearningUntil && myProfile.enhancedLearningUntil > Date.now()) {
    const hoursLeft = Math.max(1, Math.ceil((myProfile.enhancedLearningUntil - Date.now()) / STAT_TICK_MS));
    affects.push({ label: `Enhanced learning - ${hoursLeft}h` });
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
  for (const { label, expiresAt, tooltip } of affects) {
    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    if (tooltip) attachTooltip(labelEl, () => tooltip);
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
