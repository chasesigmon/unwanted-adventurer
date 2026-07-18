// The 10s respawn countdown (a later follow-up ask: "have a countdown
// shown on screen. When they die make the screen slightly darken while
// the yellow text countdown happens") — driven entirely off
// myProfile.respawningUntil, the same absolute-epoch-ms convention every
// other timed effect in this project already uses (wandLitUntil,
// flightActiveUntil, ...); called every frame from WorldScene's own
// update() loop, same as applyDaynightTint.
const overlay = document.getElementById('respawn-overlay') as HTMLDivElement;
const overlayText = document.getElementById('respawn-overlay-text') as HTMLDivElement;

export function updateRespawnOverlay(respawningUntil: number | null | undefined): void {
  if (!respawningUntil || Date.now() >= respawningUntil) {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  const secondsLeft = Math.max(1, Math.ceil((respawningUntil - Date.now()) / 1000));
  overlayText.textContent = `You have died. Respawning in ${secondsLeft}...`;
}
