// The plain-DOM status bar (level/hp/mana/mv/exp/gold), world label +
// logout button, sleep overlay, and the day/night + "no light source"
// dark-fog overlays that sit on top of the Phaser canvas.
import { myProfile, network } from '../state.js';
import type { MapName } from '../../shared/constants.js';
import { timeOfDayLabel } from '../../shared/lighting.js';
import { setupCollapsible } from './collapsible.js';

const statusBarPanel = document.getElementById('status-bar') as HTMLDivElement;
const statusToggle = document.getElementById('status-toggle') as HTMLButtonElement;
const statusLevel = document.getElementById('status-level') as HTMLSpanElement;
const statusHp = document.getElementById('status-hp') as HTMLSpanElement;
const statusMana = document.getElementById('status-mana') as HTMLSpanElement;
const statusHunger = document.getElementById('status-hunger') as HTMLSpanElement;
const statusThirst = document.getElementById('status-thirst') as HTMLSpanElement;
const statusExp = document.getElementById('status-exp') as HTMLSpanElement;
const statusGold = document.getElementById('status-gold') as HTMLSpanElement;
const worldLabel = document.getElementById('world-label') as HTMLDivElement;
const worldTimeLabel = document.getElementById('world-time-label') as HTMLDivElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const sleepOverlay = document.getElementById('sleep-overlay') as HTMLDivElement;
const daynightOverlay = document.getElementById('daynight-overlay') as HTMLDivElement;
const darkFogOverlay = document.getElementById('dark-fog-overlay') as HTMLDivElement;

setupCollapsible(statusBarPanel, statusToggle);

// A later follow-up ask: "the logout from the top right of the game
// [should] take you back out to character selection" — only the
// CHARACTER-level session is invalidated (see leaveCharacterSession's own
// doc comment), not the account itself; the account token stays behind
// in localStorage so the reload (same "just reload" reset the 'kicked'
// handler already uses elsewhere, rather than hand-unwinding the live
// Phaser game instance) lands back on character select, not the login
// screen. Logging out of the ACCOUNT entirely is now the character
// SELECT screen's own logout button (see characterSelect.ts).
logoutBtn.addEventListener('click', () => {
  void network.leaveCharacterSession().finally(() => window.location.reload());
});

export function updateWorldLabel(mapName: MapName): void {
  worldLabel.textContent = mapName;
}

// Left of the World label (a follow-up ask) — same "HH:00 (label)" format
// the /time command's own reply uses (see game.gateway.ts's
// handleTimeCommand), kept live via WorldScene's handleWorldTime.
export function updateWorldTimeLabel(hour: number): void {
  const hh = String(hour).padStart(2, '0');
  worldTimeLabel.textContent = `${hh}:00 (${timeOfDayLabel(hour)})`;
}

export function updateStatusBar(): void {
  if (!myProfile) return;
  statusLevel.textContent = `Lv ${myProfile.level}`;
  statusHp.textContent = `HP ${myProfile.hp}/${myProfile.maxHp}`;
  statusMana.textContent = `MP ${myProfile.mana}/${myProfile.maxMana}`;
  statusHunger.textContent = `Hunger ${myProfile.hunger ?? 100}/100`;
  statusThirst.textContent = `Thirst ${myProfile.thirst ?? 100}/100`;
  statusExp.textContent = `EXP ${myProfile.exp}`;
  statusGold.textContent = `Gold ${myProfile.gold}`;
  updateSleepOverlay();
}

export function updateSleepOverlay(): void {
  sleepOverlay.hidden = myProfile?.restState !== 'sleeping';
}

// A smooth day/night cycle — darkest at midnight (hour 0), fully clear at
// noon (hour 12), gradually shifting between the two rather than a hard
// day/night on-off split. No darkness is applied until the first
// 'worldTime' broadcast arrives (a fresh connection otherwise starts at
// hour 0/"midnight" for a moment before the first tick, which would open
// on a jarring dark screen).
const MAX_NIGHT_OPACITY = 0.55;

export function nightDarknessForHour(hour: number): number {
  return ((1 - Math.cos(((hour - 12) / 24) * Math.PI * 2)) / 2) * MAX_NIGHT_OPACITY;
}

// Infravision caps full midnight-dark down to whatever the ambient tint
// already looks like at 21:00 — noticeably dimmer than broad daylight,
// but nowhere near as dark as true night — applied every frame in
// WorldScene.update() (see applyDaynightTint) since it depends on the
// player's own skills, not just the hour.
export const INFRAVISION_MAX_NIGHT_OPACITY = nightDarknessForHour(21);

let currentNightDarkness = 0;
export function updateDaynightOverlay(hour: number): void {
  currentNightDarkness = nightDarknessForHour(hour);
  applyDaynightTint(false, false);
}

// A follow-up ask: "the night/day effect should only happen outside —
// inside the castle it should stay the same lighting all the time." Two
// SEPARATE reasons darkness can be reduced, not one conflated boolean:
// `alwaysLit` (a torch/fireplace-lit interior — shared/lighting.ts's
// isAlwaysLit) zeroes the tint out completely regardless of the hour,
// while `hasInfravision` (a goblin's own innate night vision, still
// outdoors) only CAPS it at a dim-but-not-black level — the previous
// single-boolean version wrongly capped (rather than zeroed) the castle's
// own tint too, leaving a faint night-time overlay indoors.
export function applyDaynightTint(alwaysLit: boolean, hasInfravision: boolean): void {
  const darkness = alwaysLit ? 0 : hasInfravision ? Math.min(currentNightDarkness, INFRAVISION_MAX_NIGHT_OPACITY) : currentNightDarkness;
  daynightOverlay.style.background = `rgba(5, 5, 20, ${darkness.toFixed(3)})`;
}

// With no light at all, only barely more than the player's own tile is
// visible — a real (if small) radius rather than zero, since rendering
// literally nothing (not even your own character) isn't playable.
export const NO_LIGHT_RADIUS_TILES = 0.5;

export function hideDarkFog(): void {
  darkFogOverlay.style.background = 'transparent';
}

// A radial "hole" centered on the player's own SCREEN position (not
// world position) — this naturally follows the camera's clamping near a
// small map's edges, same as everything else the camera renders.
export function showDarkFog(screenX: number, screenY: number, radiusPx: number): void {
  const edgePx = radiusPx * 1.6;
  darkFogOverlay.style.background = `radial-gradient(circle at ${screenX.toFixed(0)}px ${screenY.toFixed(0)}px, rgba(0,0,0,0) ${radiusPx.toFixed(0)}px, rgba(2,2,6,0.96) ${edgePx.toFixed(0)}px)`;
}
