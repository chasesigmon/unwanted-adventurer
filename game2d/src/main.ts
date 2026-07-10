import Phaser from 'phaser';
import { NetworkManager } from './net.js';
import { createWallTorchTexture, WALL_TORCH_TEXTURE_KEY } from './wallTorchSprite.js';

// Real image assets under game2d/assets/ (Vite's publicDir, served at
// the site root — see characterSprites.ts's own SHEET_PATHS for the
// established convention), loaded via Phaser's SVG loader in preload()
// below — not procedurally drawn at runtime (see the memory note this
// was converted to follow: new sprites/textures are real asset files).
const TILE_SIZE = 32;
const TREE_TEXTURE_KEY = 'tree';
const DAGGER_TEXTURE_KEY = 'held-dagger';
const BONE_SHIELD_TEXTURE_KEY = 'held-bone-shield';
const TORCH_HELD_TEXTURE_KEY = 'held-torch';
import {
  preloadCharacterSprites,
  createCharacterAnims,
  defineBodyPartFrames,
  bodyPartFrameKey,
  textureKeyFor,
  idleFrameFor,
  walkAnimKey,
  punchAnimKey,
  type FacingGroup,
  type SpriteKind,
} from './characterSprites.js';
import { getMap, MAPS } from '../shared/maps.js';
import { treePositionsFor } from '../shared/trees.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type EquipmentSlot } from '../shared/equipment.js';
import {
  STARTING_SKILLS,
  HOBGOBLIN_EVOLUTION_SKILLS,
  RESISTANCE_SKILLS,
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  INFRAVISION_SKILL,
  LACERATE_SKILL,
  MIMIC_SKILL,
  REVERT_SKILL,
  EAT_BRAINS_SKILL,
  ENHANCED_DURABILITY_SKILL,
  BONE_FINGER_STRIKE_SKILL,
  GLARE_SKILL,
  SKILL_COOLDOWN_MS,
} from '../shared/skills.js';
import {
  isDarkHour,
  LIGHT_RADIUS_TILES,
  SHOP_REACH_TILES,
  isNearStaticLight,
  isWithinLightRadius,
  isWithinRadius,
  TORCH_ITEM,
  isAlwaysLit,
  torchWallPositionsFor,
} from '../shared/lighting.js';
import { MAP_NAMES, MONSTER_KINDS } from '../shared/constants.js';
import type { MapName, Race, Direction, MonsterKind } from '../shared/constants.js';
import type {
  PlayerSnapshot,
  SyncPayload,
  KickedPayload,
  MapStatePayload,
  PunchPayload,
  CombatEventPayload,
  ChatPayload,
  WhoEntry,
  StatTickPayload,
  RestState,
  UseItemAck,
  WorldTimePayload,
  VendorSnapshot,
} from '../shared/types.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';

// A hand-rolled inline SVG cursor (item 10) rather than an image asset —
// a small enough shape that hand-authored SVG is clearer than a sprite
// round-trip. Hotspot (12, 12) sits on the blade so the tip visually
// points at whatever's under the cursor.
const SWORD_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <g transform="rotate(45 12 12)">
    <rect x="10.5" y="1" width="3" height="13" rx="0.5" fill="#e4e4e4" stroke="#2a2a2a" stroke-width="0.75"/>
    <rect x="11.4" y="1" width="1.2" height="13" fill="#ffffff" opacity="0.6"/>
    <rect x="7" y="14" width="10" height="2.4" rx="0.6" fill="#8a6a3a" stroke="#2a2a2a" stroke-width="0.5"/>
    <rect x="10.3" y="16.4" width="3.4" height="6.2" rx="1" fill="#5a4020" stroke="#2a2a2a" stroke-width="0.5"/>
  </g>
</svg>`;
const SWORD_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(SWORD_CURSOR_SVG)}") 12 12, pointer`;

const CHAR_SCALE = 0.275;
const CORPSE_SCALE = 0.35;
// One server round trip per tile-step, throttled the same way holding a
// key down is throttled everywhere else in this project — the walk
// animation plays for exactly this long while tweening between tiles, so
// it reads as a step, not a teleport.
const MOVE_COOLDOWN_MS = 220;
// Other players/monsters only report a NEW position every so often (see
// the server's own wander/broadcast tick) — tweening the visible step
// over this much shorter duration is what turns "teleports" into "walks".
const REMOTE_STEP_TWEEN_MS = 260;

const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 5;
const HP_BAR_OFFSET_Y = -25;
const COMBAT_LOG_MAX_LINES = 60;

// ---------- Auth screen ----------

const authScreen = document.getElementById('auth-screen') as HTMLDivElement;
const gameRoot = document.getElementById('game-root') as HTMLDivElement;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
const raceLabel = document.getElementById('auth-race-label') as HTMLLabelElement;
const raceSelect = document.getElementById('auth-race') as HTMLSelectElement;
const authError = document.getElementById('auth-error') as HTMLDivElement;
const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
const tabRegister = document.getElementById('tab-register') as HTMLButtonElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;

// ---------- Status bar / combat log (plain DOM, sits on top of the canvas) ----------

const statusBarPanel = document.getElementById('status-bar') as HTMLDivElement;
const statusToggle = document.getElementById('status-toggle') as HTMLButtonElement;
const statusLevel = document.getElementById('status-level') as HTMLSpanElement;
const statusHp = document.getElementById('status-hp') as HTMLSpanElement;
const statusMana = document.getElementById('status-mana') as HTMLSpanElement;
const statusMv = document.getElementById('status-mv') as HTMLSpanElement;
const statusExp = document.getElementById('status-exp') as HTMLSpanElement;
const statusGold = document.getElementById('status-gold') as HTMLSpanElement;
const worldLabel = document.getElementById('world-label') as HTMLDivElement;
const targetPanel = document.getElementById('target-panel') as HTMLDivElement;
const targetName = document.getElementById('target-name') as HTMLSpanElement;
const targetHpFill = document.getElementById('target-hp-fill') as HTMLDivElement;
const sleepOverlay = document.getElementById('sleep-overlay') as HTMLDivElement;
const daynightOverlay = document.getElementById('daynight-overlay') as HTMLDivElement;
const darkFogOverlay = document.getElementById('dark-fog-overlay') as HTMLDivElement;

// ---------- Action bar (2x10 slots — item 13) ---------- built here
// rather than hand-written in index.html since it's a fixed, repetitive
// grid. A skill icon (see the Skills modal's renderSkillRow) can be
// dragged into any slot; a filled slot is then clickable, using that
// skill on the currently selected target (item 14) — see
// WorldScene.useTargetedSkill, the single place that interprets what
// each skill name actually does.

// A deterministic (not random) color per skill name, so the same skill
// always gets the same swatch across the Skills modal and the action
// bar without a hand-maintained color table.
function skillIconColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 55%, 35%)`;
}

// Only a skill with a real, currently-implemented targeted action can be
// slotted — everything else in this project is a passive bonus (see
// shared/skills.ts), not something to manually fire at a target.
// Punch/dagger throw the same contact-range attack the direction
// keys/right-click already do, aimed at whichever target is currently
// selected; bone finger strike and glare are real separate active skills
// (see game.gateway.ts's handleUseSkill) — glare no longer applies
// automatically on every hit a skeleton lands (item 14), it has to be
// deliberately queued like this.
function isUsableSkill(skillName: string): boolean {
  return skillName === PUNCH_SKILL || skillName === DAGGER_SKILL || skillName === BONE_FINGER_STRIKE_SKILL || skillName === GLARE_SKILL;
}

// Punch and dagger are the same underlying action from the player's own
// perspective — whatever's equipped, right-click just throws "an attack"
// (see item 20) — so they share one icon/letter and may only occupy ONE
// action-bar slot between the two of them (see the drop handler below).
function isAttackSkill(skillName: string): boolean {
  return skillName === PUNCH_SKILL || skillName === DAGGER_SKILL;
}

function skillIconLetter(skillName: string): string {
  return isAttackSkill(skillName) ? 'A' : skillName.charAt(0).toUpperCase();
}

// Short mechanical/flavor blurbs for the Skills modal's name-hover
// tooltip (item 16) — native `title` attributes (a small delayed
// tooltip, no custom component needed) paired with a `cursor: help` so
// hovering the NAME (as opposed to the drag-handle icon) reads as "more
// info here" rather than "draggable".
const SKILL_DESCRIPTIONS: Record<string, string> = {
  [PUNCH_SKILL]: 'Bare-handed melee damage. Grows with practice; used automatically whenever no weapon is equipped.',
  [DODGE_SKILL]: 'Chance to fully avoid an incoming hit by evasion. Grows whenever it triggers.',
  [PARRY_SKILL]: "Chance to fully avoid an incoming hit with your weapon. Requires a weapon equipped; grows whenever it triggers.",
  [SHIELD_BLOCK_SKILL]: 'Chance to fully avoid an incoming hit with a shield. Requires a bone shield equipped; grows on every attempt.',
  [DAGGER_SKILL]: 'Melee damage while a dagger is equipped, replacing punch. Grows with practice.',
  [SECOND_ATTACK_SKILL]: 'Hobgoblin-only: chance of an extra swing on top of your normal attack.',
  [THIRD_ATTACK_SKILL]: 'Hobgoblin-only: chance of a second extra swing on top of your normal attack.',
  [ENHANCED_DAMAGE_SKILL]: 'Hobgoblin-only: a flat bonus added to your base hit damage.',
  [LESSER_NORMAL_MONSTER_RESISTANCE]: 'Reduces damage taken from normal-class monster counter-attacks.',
  [LESSER_UNDEAD_MONSTER_RESISTANCE]: 'Reduces damage taken from undead-class monster counter-attacks.',
  [INFRAVISION_SKILL]: 'Goblin-only: see clearly across the whole map regardless of time of day, no torch needed.',
  [LACERATE_SKILL]: 'Dragonborn-only: chance of an extra laceration attack on top of your normal attack.',
  [MIMIC_SKILL]: "Slime-only: transform into the form of any race/monster whose body part you've consumed.",
  [REVERT_SKILL]: 'Slime-only: change back to your plain slime form.',
  [EAT_BRAINS_SKILL]: 'Zombie-only: heal a portion of hp/mana/movement by eating the brains of a corpse you personally killed.',
  [GLARE_SKILL]: 'Skeleton-only: paralyze whoever you hit, blocking their counter-attack. Has its own cooldown between casts.',
  [ENHANCED_DURABILITY_SKILL]: 'Skeleton-only: passively tougher armor (future work — no armor system yet).',
  [BONE_FINGER_STRIKE_SKILL]:
    'A separate active attack, earnable by chance from consuming bone daggers. Deals 1.5x your normal hit damage, scaling further with skill percent.',
};

const ACTION_BAR_SLOT_COUNT = 20;
const actionBar = document.getElementById('action-bar') as HTMLDivElement;
const actionSlots: HTMLDivElement[] = [];
const actionBarSkills: Array<string | null> = new Array(ACTION_BAR_SLOT_COUNT).fill(null);

// Cooldown visualization (item 23) shared between the Skills modal's
// icons and the action bar's slots — a dark radial "clock wipe" overlay
// that shrinks from a full circle down to nothing as the cooldown
// elapses. Purely wall-clock driven (see shared/skills.ts's
// SKILL_COOLDOWN_MS/PlayerSnapshot.skillCooldowns), refreshed on a timer
// rather than tied to any server push.
function cooldownFraction(skillName: string): number {
  if (!myProfile) return 0;
  const readyAt = myProfile.skillCooldowns[skillName];
  const totalMs = SKILL_COOLDOWN_MS[skillName];
  if (readyAt === undefined || totalMs === undefined) return 0;
  const remaining = readyAt - Date.now();
  if (remaining <= 0) return 0;
  return Math.min(1, remaining / totalMs);
}

function createCooldownOverlay(skillName: string): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'cooldown-overlay';
  overlay.dataset.skill = skillName;
  return overlay;
}

function updateCooldownOverlay(overlay: HTMLElement): void {
  const skillName = overlay.dataset.skill;
  if (!skillName) {
    overlay.style.background = 'transparent';
    return;
  }
  const fraction = cooldownFraction(skillName);
  if (fraction <= 0) {
    overlay.style.background = 'transparent';
    return;
  }
  const deg = (fraction * 360).toFixed(1);
  overlay.style.background = `conic-gradient(rgba(0, 0, 0, 0.75) ${deg}deg, transparent ${deg}deg)`;
}

// A periodic sweep (rather than tracking element references) — finds
// whatever cooldown overlays currently exist in the DOM (action-bar
// slots always; Skills modal icons only while it's open) and updates
// each from its own `data-skill` tag.
function refreshCooldownOverlays(): void {
  document.querySelectorAll<HTMLElement>('.cooldown-overlay').forEach(updateCooldownOverlay);
}
setInterval(refreshCooldownOverlays, 250);

function renderActionSlot(index: number): void {
  // Always called with an index this same module just created below, so
  // the slot is guaranteed to exist.
  const slot = actionSlots[index]!;
  const skillName = actionBarSkills[index];
  slot.classList.toggle('filled', skillName !== null);
  slot.draggable = skillName !== null;
  const overlay = slot.querySelector<HTMLElement>('.cooldown-overlay')!;
  if (skillName) {
    slot.textContent = skillIconLetter(skillName);
    slot.appendChild(overlay); // textContent= above wipes children too — re-append
    slot.style.background = skillIconColor(skillName);
    slot.title = `${skillName} (click to use on your selected target, drag off to remove)`;
    overlay.dataset.skill = skillName;
  } else {
    slot.textContent = '';
    slot.appendChild(overlay);
    slot.style.background = '';
    slot.title = '';
    delete overlay.dataset.skill;
  }
  updateCooldownOverlay(overlay);
}

// Persisted per-username in localStorage so a slotted loadout survives a
// reload/reconnect — purely a client-side convenience, the server has no
// idea the action bar exists at all.
function actionBarStorageKey(username: string): string {
  return `game2d:actionBar:${username}`;
}

function saveActionBar(): void {
  if (!myProfile) return;
  try {
    localStorage.setItem(actionBarStorageKey(myProfile.username), JSON.stringify(actionBarSkills));
  } catch {
    /* localStorage unavailable (private browsing etc.) — not worth surfacing */
  }
}

let actionBarLoadedForUsername: string | null = null;
function loadActionBarOnce(username: string): void {
  if (actionBarLoadedForUsername === username) return;
  actionBarLoadedForUsername = username;
  try {
    const raw = localStorage.getItem(actionBarStorageKey(username));
    if (!raw) return;
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return;
    for (let i = 0; i < ACTION_BAR_SLOT_COUNT; i++) {
      const skillName = saved[i];
      actionBarSkills[i] = typeof skillName === 'string' ? skillName : null;
      renderActionSlot(i);
    }
  } catch {
    /* corrupt/missing data — just leave the bar empty */
  }
}

// Custom MIME type carrying which action-bar slot a drag started from
// (if any) — set only when dragging FROM a slot (see the dragstart
// handler below), never when dragging from the Skills modal — so the
// drop handler can tell "rearranging within the bar" (clear the source
// slot too) apart from "dragging a fresh copy in from the modal".
const ACTION_SLOT_SOURCE_MIME = 'application/x-action-slot-index';

function assignActionSlot(index: number, skillName: string): void {
  // Punch and dagger share one "Attack" slot (item 20) — dropping either
  // one bumps whichever OTHER slot currently holds the other, rather
  // than allowing two at once.
  if (isAttackSkill(skillName)) {
    for (let j = 0; j < ACTION_BAR_SLOT_COUNT; j++) {
      if (j !== index && actionBarSkills[j] !== null && isAttackSkill(actionBarSkills[j]!)) {
        actionBarSkills[j] = null;
        renderActionSlot(j);
      }
    }
  }
  actionBarSkills[index] = skillName;
  renderActionSlot(index);
}

for (let i = 0; i < ACTION_BAR_SLOT_COUNT; i++) {
  const slot = document.createElement('div');
  slot.className = 'action-slot';
  slot.dataset.slotIndex = String(i);
  slot.appendChild(createCooldownOverlay(''));
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    const skillName = e.dataTransfer?.getData('text/plain');
    if (!skillName) return;
    const sourceIndexRaw = e.dataTransfer?.getData(ACTION_SLOT_SOURCE_MIME);
    const sourceIndex = sourceIndexRaw ? Number(sourceIndexRaw) : null;

    assignActionSlot(i, skillName);
    // Dragging in from ANOTHER slot is a move, not a copy — clear
    // wherever it came from (unless dropped back onto itself).
    if (sourceIndex !== null && sourceIndex !== i && actionBarSkills[sourceIndex] === skillName) {
      actionBarSkills[sourceIndex] = null;
      renderActionSlot(sourceIndex);
    }
    saveActionBar();
  });
  // A filled slot is itself draggable (item 13) — dropped anywhere that
  // doesn't accept it (dropEffect stays 'none'), that's how you remove
  // it from the bar entirely.
  slot.addEventListener('dragstart', (e) => {
    const skillName = actionBarSkills[i];
    if (!skillName) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', skillName);
    e.dataTransfer?.setData(ACTION_SLOT_SOURCE_MIME, String(i));
  });
  slot.addEventListener('dragend', (e) => {
    if (e.dataTransfer?.dropEffect === 'none' && actionBarSkills[i] !== null) {
      actionBarSkills[i] = null;
      renderActionSlot(i);
      saveActionBar();
    }
  });
  slot.addEventListener('click', () => {
    const skillName = actionBarSkills[i];
    if (skillName) activeScene?.useTargetedSkill(skillName);
  });
  actionBar.appendChild(slot);
  actionSlots.push(slot);
}

function updateWorldLabel(mapName: MapName): void {
  worldLabel.textContent = mapName;
}

// Backs item 11's left-click targeting — see WorldScene's
// setTarget/clearTarget, the only callers.
function updateTargetPanel(label: string, level: number, hp: number, maxHp: number): void {
  targetPanel.hidden = false;
  targetName.textContent = `${label} (Lv ${level})`;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  targetHpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
}

function hideTargetPanel(): void {
  targetPanel.hidden = true;
}

function updateSleepOverlay(): void {
  sleepOverlay.hidden = myProfile?.restState !== 'sleeping';
}

// A smooth day/night cycle — darkest at midnight (hour 0), fully clear at
// noon (hour 12), gradually shifting between the two rather than the
// text game's own hard day/night on-off split. No darkness is applied
// until the first 'worldTime' broadcast arrives (a fresh connection
// otherwise starts at hour 0/"midnight" for a moment before the first
// tick, which would open on a jarring dark screen).
const MAX_NIGHT_OPACITY = 0.55;

function nightDarknessForHour(hour: number): number {
  return ((1 - Math.cos(((hour - 12) / 24) * Math.PI * 2)) / 2) * MAX_NIGHT_OPACITY;
}

// Infravision caps full midnight-dark down to whatever the ambient tint
// already looks like at 21:00 — noticeably dimmer than broad daylight,
// but nowhere near as dark as true night — applied every frame in
// WorldScene.update() (see applyDaynightTint) since it depends on the
// player's own skills, not just the hour.
const INFRAVISION_MAX_NIGHT_OPACITY = nightDarknessForHour(21);

let currentNightDarkness = 0;
function updateDaynightOverlay(hour: number): void {
  currentNightDarkness = nightDarknessForHour(hour);
  applyDaynightTint(false);
}

function applyDaynightTint(hasFullVision: boolean): void {
  const darkness = hasFullVision ? Math.min(currentNightDarkness, INFRAVISION_MAX_NIGHT_OPACITY) : currentNightDarkness;
  daynightOverlay.style.background = `rgba(5, 5, 20, ${darkness.toFixed(3)})`;
}

// The "can't see outside without a light source" mechanic (see
// shared/lighting.ts) — a hard, narrower window than the cosmetic
// day/night tint above. Not known until the first 'worldTime' broadcast,
// same reasoning as MAX_NIGHT_OPACITY above.
let currentWorldHour = 12;
let worldTimeKnown = false;
// The same world-tick counter GameGateway measures Eat Brains/Glare
// cooldowns in — lets updateEatBrainsButton gray the button out instead
// of it just failing silently when clicked mid-cooldown.
let currentWorldTick = 0;
function updateWorldHour(hour: number, tick: number): void {
  currentWorldHour = hour;
  currentWorldTick = tick;
  worldTimeKnown = true;
  updateDaynightOverlay(hour);
  updateEatBrainsButton();
}

// With no light at all, only barely more than the player's own tile is
// visible — a real (if small) radius rather than zero, since rendering
// literally nothing (not even your own character) isn't playable.
const NO_LIGHT_RADIUS_TILES = 0.5;

function hideDarkFog(): void {
  darkFogOverlay.style.background = 'transparent';
}

// A radial "hole" centered on the player's own SCREEN position (not
// world position) — this naturally follows the camera's clamping near a
// small map's edges, same as everything else the camera renders.
function showDarkFog(screenX: number, screenY: number, radiusPx: number): void {
  const edgePx = radiusPx * 1.6;
  darkFogOverlay.style.background = `radial-gradient(circle at ${screenX.toFixed(0)}px ${screenY.toFixed(0)}px, rgba(0,0,0,0) ${radiusPx.toFixed(0)}px, rgba(2,2,6,0.96) ${edgePx.toFixed(0)}px)`;
}

const logPanel = document.getElementById('log-panel') as HTMLDivElement;
const logToggle = document.getElementById('log-toggle') as HTMLButtonElement;
const logResizeHandle = document.getElementById('log-resize-handle') as HTMLDivElement;
const combatLogEl = document.getElementById('combat-log') as HTMLDivElement;
const chatLogEl = document.getElementById('chat-log') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const logTabCombatBtn = document.getElementById('log-tab-combat') as HTMLButtonElement;
const logTabChatBtn = document.getElementById('log-tab-chat') as HTMLButtonElement;

function setupCollapsible(panel: HTMLElement, toggle: HTMLButtonElement): void {
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '+' : '−';
  });
}
setupCollapsible(statusBarPanel, statusToggle);
setupCollapsible(logPanel, logToggle);

// Custom drag-resize (item 11) instead of the native CSS `resize: both`
// handle — the panel is anchored to the bottom-left of the screen (see
// #log-panel's `bottom`/`left`), and the native resize box only reliably
// grows in the direction away from whichever edges are actually anchored
// in every browser; a handle we drive ourselves works the same way
// regardless of anchor edge. Dragging down-right grows the panel
// (upward/rightward, away from its bottom-left anchor).
const LOG_PANEL_MIN_WIDTH = 260;
const LOG_PANEL_MIN_HEIGHT = 120;
(function setupLogPanelResize(): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  logResizeHandle.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = logPanel.getBoundingClientRect().width;
    startHeight = logPanel.getBoundingClientRect().height;
    logResizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  logResizeHandle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.8;
    const width = Math.min(maxWidth, Math.max(LOG_PANEL_MIN_WIDTH, startWidth + (e.clientX - startX)));
    const height = Math.min(maxHeight, Math.max(LOG_PANEL_MIN_HEIGHT, startHeight + (e.clientY - startY)));
    logPanel.style.width = `${width}px`;
    logPanel.style.height = `${height}px`;
  });
  const stopDragging = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    logResizeHandle.releasePointerCapture(e.pointerId);
  };
  logResizeHandle.addEventListener('pointerup', stopDragging);
  logResizeHandle.addEventListener('pointercancel', stopDragging);
})();

function appendLogLine(container: HTMLDivElement, text: string, kind?: 'level-up' | 'death'): void {
  const line = document.createElement('div');
  line.className = kind ? `log-line ${kind}` : 'log-line';
  line.textContent = text;
  container.appendChild(line);
  while (container.childElementCount > COMBAT_LOG_MAX_LINES) {
    container.removeChild(container.firstChild as ChildNode);
  }
  container.scrollTop = container.scrollHeight;
}

function logCombatMessage(message: string, kind?: 'level-up' | 'death'): void {
  appendLogLine(combatLogEl, message, kind);
}

function logChatMessage(username: string, message: string): void {
  appendLogLine(chatLogEl, `${username}: ${message}`);
}

// Combat and Chat are independently toggleable (item 14) — either or
// both can be visible, but turning the last visible one off is refused
// (at least one must always stay up). Replaces the old mutually-exclusive
// switchLogTab.
let combatTabVisible = true;
let chatTabVisible = false;

function updateLogTabsView(): void {
  logTabCombatBtn.classList.toggle('active', combatTabVisible);
  logTabChatBtn.classList.toggle('active', chatTabVisible);
  combatLogEl.hidden = !combatTabVisible;
  chatLogEl.hidden = !chatTabVisible;
  // The chat input only makes sense while the chat pane itself is
  // visible — hiding the Chat tab hides its input along with it.
  if (!chatTabVisible) chatInput.hidden = true;
}

function setLogTabVisible(tab: 'combat' | 'chat', visible: boolean): void {
  if (!visible) {
    const otherVisible = tab === 'combat' ? chatTabVisible : combatTabVisible;
    if (!otherVisible) return; // refused — at least one tab must stay active
  }
  if (tab === 'combat') combatTabVisible = visible;
  else chatTabVisible = visible;
  updateLogTabsView();
}

// Auto-shows the Combat tab exactly once at the START of a fight (if it
// wasn't already visible) — not on every single exchange, and never
// hides Chat to do it (item 14: both can be up at once). A "fight" is
// considered over (so the NEXT punch counts as a new start) after a few
// seconds of no combat activity.
const COMBAT_SESSION_IDLE_MS = 8000;
let combatSessionActive = false;
let combatSessionTimer: ReturnType<typeof setTimeout> | null = null;

function noteCombatActivity(): void {
  if (!combatSessionActive) {
    combatSessionActive = true;
    setLogTabVisible('combat', true);
  }
  if (combatSessionTimer) clearTimeout(combatSessionTimer);
  combatSessionTimer = setTimeout(() => {
    combatSessionActive = false;
  }, COMBAT_SESSION_IDLE_MS);
}

logTabCombatBtn.addEventListener('click', () => setLogTabVisible('combat', !combatTabVisible));
logTabChatBtn.addEventListener('click', () => setLogTabVisible('chat', !chatTabVisible));
updateLogTabsView();

// Pressing Enter anywhere (outside a modal/another input) reveals and
// focuses the chat box — matching the text game's own "press Enter to
// chat" convention. Typing in it doesn't fight Phaser's global keyboard
// capture for the same reason the autopilot prompt doesn't (see
// setKeyCaptureEnabled) — focus/blur toggle it directly since the chat
// box isn't one of the ALL_MODALS.
let chatInputFocused = false;
function openChatInput(): void {
  setLogTabVisible('chat', true);
  chatInput.hidden = false;
  chatInput.focus();
}
// Pressing "/" does the same, but also pre-fills the "/" character (item
// 9) — a player pressing it almost always means to type a command, so
// it starts the input exactly where they'd type it themselves anyway.
function openChatInputWithSlash(): void {
  setLogTabVisible('chat', true);
  chatInput.hidden = false;
  chatInput.value = '/';
  chatInput.focus();
  chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
}
chatInput.addEventListener('focus', () => {
  chatInputFocused = true;
  updateInputCaptured();
});
chatInput.addEventListener('blur', () => {
  chatInputFocused = false;
  updateInputCaptured();
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = chatInput.value.trim();
    chatInput.value = '';
    if (text) network.chat(text);
    chatInput.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    chatInput.blur();
  }
});

// Clicking anywhere outside the chat box (the game canvas, a corner
// button, ...) takes focus away from it too, not just sending a message.
document.addEventListener('mousedown', (e) => {
  if (chatInputFocused && e.target !== chatInput) chatInput.blur();
});

// ---------- Character sheet / inventory modals ----------

const charSheetBtn = document.getElementById('char-sheet-btn') as HTMLButtonElement;
const inventoryBtn = document.getElementById('inventory-btn') as HTMLButtonElement;
const autopilotBtn = document.getElementById('autopilot-btn') as HTMLButtonElement;
const skillsBtn = document.getElementById('skills-btn') as HTMLButtonElement;
const equipmentBtn = document.getElementById('equipment-btn') as HTMLButtonElement;
const mapBtn = document.getElementById('map-btn') as HTMLButtonElement;
const charSheetModal = document.getElementById('char-sheet-modal') as HTMLDivElement;
const charSheetUsername = document.getElementById('char-sheet-username') as HTMLHeadingElement;
const charSheetBody = document.getElementById('char-sheet-body') as HTMLDivElement;
const inventoryModal = document.getElementById('inventory-modal') as HTMLDivElement;
const inventoryList = document.getElementById('inventory-list') as HTMLUListElement;
const skillsModal = document.getElementById('skills-modal') as HTMLDivElement;
const skillsBody = document.getElementById('skills-body') as HTMLDivElement;
const skillsShowAllToggle = document.getElementById('skills-show-all-toggle') as HTMLButtonElement;
const equipmentModal = document.getElementById('equipment-modal') as HTMLDivElement;
const equipmentBody = document.getElementById('equipment-body') as HTMLDivElement;
const mapModal = document.getElementById('map-modal') as HTMLDivElement;
const mapBody = document.getElementById('map-body') as HTMLDivElement;
const mapTabCurrentBtn = document.getElementById('map-tab-current') as HTMLButtonElement;
const mapTabWorldBtn = document.getElementById('map-tab-world') as HTMLButtonElement;
const mapTabWhoBtn = document.getElementById('map-tab-who') as HTMLButtonElement;
const mapTabWhereBtn = document.getElementById('map-tab-where') as HTMLButtonElement;
const corpseModal = document.getElementById('corpse-modal') as HTMLDivElement;
const corpseModalTitle = document.getElementById('corpse-modal-title') as HTMLHeadingElement;
const corpseItemList = document.getElementById('corpse-item-list') as HTMLUListElement;
const corpseGrabAllBtn = document.getElementById('corpse-grab-all') as HTMLButtonElement;
const corpseEatBrainsBtn = document.getElementById('corpse-eat-brains') as HTMLButtonElement;
const corpseSacrificeBtn = document.getElementById('corpse-sacrifice') as HTMLButtonElement;
const shopModal = document.getElementById('shop-modal') as HTMLDivElement;
const shopModalTitle = document.getElementById('shop-modal-title') as HTMLHeadingElement;
const shopGoldLine = document.getElementById('shop-gold-line') as HTMLDivElement;
const shopItemList = document.getElementById('shop-item-list') as HTMLUListElement;
const targetInfoModal = document.getElementById('target-info-modal') as HTMLDivElement;
const targetInfoTitle = document.getElementById('target-info-title') as HTMLHeadingElement;
const targetInfoBody = document.getElementById('target-info-body') as HTMLDivElement;
const targetInfoConsideration = document.getElementById('target-info-consideration') as HTMLDivElement;
const autopilotModal = document.getElementById('autopilot-modal') as HTMLDivElement;
const autopilotInput = document.getElementById('autopilot-input') as HTMLInputElement;
const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;

const ALL_MODALS = [
  charSheetModal,
  inventoryModal,
  skillsModal,
  equipmentModal,
  mapModal,
  corpseModal,
  shopModal,
  targetInfoModal,
  autopilotModal,
];

// The single source of truth for "my own" stats — updated on 'sync' and
// on any 'combat'/'loot' outcome that affects me, and read by the status
// bar and both modals. WorldScene owns game logic (position, facing,
// sprites); this is purely the display-side profile.
let myProfile: PlayerSnapshot | null = null;
let inputCaptured = false;

function updateInputCaptured(): void {
  inputCaptured = chatInputFocused || ALL_MODALS.some((m) => !m.hidden);
  // Phaser's global keyboard manager calls preventDefault() on captured
  // keys (W/A/S/D, space, arrows, ...) purely based on keycode — it
  // doesn't check event.target, so it silently ate keystrokes typed into
  // the autopilot prompt's plain HTML <input> even though that input had
  // focus. Toggling this off while any modal is open restores normal
  // typing; turning it back on once every modal is closed restores the
  // "don't let space/arrows scroll the page" behavior during play.
  activeScene?.setKeyCaptureEnabled(!inputCaptured);
}

function updateStatusBar(): void {
  if (!myProfile) return;
  statusLevel.textContent = `Lv ${myProfile.level}`;
  statusHp.textContent = `HP ${myProfile.hp}/${myProfile.maxHp}`;
  statusMana.textContent = `MP ${myProfile.mana}/${myProfile.maxMana}`;
  statusMv.textContent = `MV ${myProfile.movement}/${myProfile.maxMovement}`;
  statusExp.textContent = `EXP ${myProfile.exp}`;
  statusGold.textContent = `Gold ${myProfile.gold}`;
  updateSleepOverlay();
}

function appendStatRow(container: HTMLDivElement, label: string, value: string | number, description?: string): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;
  // Item 18: only a stat with a real description gets the "more info
  // here" tooltip cursor — everything else (Race, Level, HP, Mana,
  // Movement, ...) explicitly stays the default arrow rather than
  // whatever a bare text node would otherwise pick up (an I-beam, in
  // most browsers, since it reads as selectable text).
  if (description) {
    labelEl.title = description;
    labelEl.style.cursor = 'help';
  } else {
    labelEl.style.cursor = 'default';
  }
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = String(value);
  container.appendChild(labelEl);
  container.appendChild(valueEl);
}

const CHAR_SHEET_STAT_DESCRIPTIONS: Record<string, string> = {
  Exp: 'Experience earned toward your next level. Each level requires level x 100 exp.',
  Strength: 'Increases your base melee damage and your parry chance.',
  Intelligence: 'No mechanical effect yet — reserved for future spellcasting.',
  Wisdom: 'No mechanical effect yet — reserved for future use.',
  Dexterity: 'Increases your dodge chance.',
  Constitution: 'No mechanical effect yet — reserved for future use.',
  'Consumed Exp': 'A count of body parts you have consumed (+5 each). Goblins reach Hobgoblin evolution at 300.',
};

function renderCharSheet(): void {
  if (!myProfile) return;
  charSheetUsername.textContent = myProfile.username;
  charSheetBody.innerHTML = '';

  const rows: Array<[string, string | number]> = [
    ['Race', myProfile.race],
    ['Level', myProfile.level],
    ['Exp', myProfile.exp],
    ['HP', `${myProfile.hp}/${myProfile.maxHp}`],
    ['Mana', `${myProfile.mana}/${myProfile.maxMana}`],
    ['Movement', `${myProfile.movement}/${myProfile.maxMovement}`],
    ['Strength', myProfile.strength],
    ['Intelligence', myProfile.intelligence],
    ['Wisdom', myProfile.wisdom],
    ['Dexterity', myProfile.dexterity],
    ['Constitution', myProfile.constitution],
    ['Consumed Exp', myProfile.consumeExp],
  ];
  for (const [label, value] of rows) appendStatRow(charSheetBody, label, value, CHAR_SHEET_STAT_DESCRIPTIONS[label]);
}

// There's no real per-level skill unlock system in this project (see
// game.gateway.ts — skills are granted at creation, on evolving, or by
// chance on consuming a body part, never gated behind a specific
// character level) — "Show All" instead previews every skill this
// character could ever still acquire down their current path (their base
// kit, the Hobgoblin-exclusive skills if they haven't evolved yet, and
// the two resistance skills), so the player can see what's left to earn.
let showAllSkills = false;

function acquirableSkillPool(): string[] {
  const pool = new Set(STARTING_SKILLS);
  if (myProfile?.race !== 'hobgoblin') {
    for (const skill of HOBGOBLIN_EVOLUTION_SKILLS) pool.add(skill);
  }
  for (const skill of RESISTANCE_SKILLS) pool.add(skill);
  return [...pool];
}

// A skill row with a small icon to the left of its name (item 14) — built
// by hand rather than reusing appendStatRow, since a usable skill's icon
// also needs to be draggable into the action bar.
function renderSkillRow(skillName: string, valueText: string, notAcquired: boolean): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label skill-label';

  const icon = document.createElement('span');
  icon.className = 'skill-icon';
  icon.textContent = skillIconLetter(skillName);
  icon.style.background = skillIconColor(skillName);

  const usable = !notAcquired && isUsableSkill(skillName);
  if (usable) {
    icon.draggable = true;
    icon.classList.add('draggable');
    icon.title = 'Drag to the action bar (or double-click) to use on your selected target';
    icon.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', skillName);
    });
    // Double-click drops it straight into the next free action-bar slot
    // (item 12) — the same singleton-attack-slot rule the drag-and-drop
    // path uses applies here too (see assignActionSlot).
    icon.addEventListener('dblclick', () => {
      const freeIndex = actionBarSkills.findIndex((s) => s === null);
      const targetIndex = isAttackSkill(skillName)
        ? (actionBarSkills.findIndex((s) => s !== null && isAttackSkill(s)) !== -1
            ? actionBarSkills.findIndex((s) => s !== null && isAttackSkill(s))
            : freeIndex)
        : freeIndex;
      if (targetIndex === -1) {
        logCombatMessage('Your action bar is full.');
        return;
      }
      assignActionSlot(targetIndex, skillName);
      saveActionBar();
    });
  }
  icon.appendChild(createCooldownOverlay(skillName));

  const nameSpan = document.createElement('span');
  nameSpan.textContent = skillName;
  // Hovering the NAME (not the drag-handle icon) shows a description
  // tooltip (item 16) — the native `title` attribute is a small,
  // no-component-needed tooltip; `cursor: help` signals "more info here"
  // distinctly from the icon's own grab/default cursor.
  nameSpan.title = SKILL_DESCRIPTIONS[skillName] ?? '';
  nameSpan.style.cursor = 'help';

  labelEl.appendChild(icon);
  labelEl.appendChild(nameSpan);

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = valueText;
  if (notAcquired) valueEl.classList.add('not-acquired');

  skillsBody.appendChild(labelEl);
  skillsBody.appendChild(valueEl);
}

function renderSkills(): void {
  if (!myProfile) return;
  skillsBody.innerHTML = '';
  for (const [skillName, percent] of Object.entries(myProfile.skills)) {
    renderSkillRow(skillName, `${percent}%`, false);
  }
  if (showAllSkills) {
    for (const skillName of acquirableSkillPool()) {
      if (myProfile.skills[skillName] !== undefined) continue;
      renderSkillRow(skillName, '(not yet acquired)', true);
    }
  }
}

skillsShowAllToggle.addEventListener('click', () => {
  showAllSkills = !showAllSkills;
  skillsShowAllToggle.classList.toggle('active', showAllSkills);
  renderSkills();
});

// A slot with something equipped gets a small 'x' next to it (item 15) —
// built by hand rather than reusing appendStatRow, same reasoning as the
// Skills modal's renderSkillRow.
function renderEquipmentRow(slot: EquipmentSlot, label: string, item: string | undefined): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value equipment-value';
  const text = document.createElement('span');
  text.textContent = item ?? '(none)';
  valueEl.appendChild(text);

  if (item) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'equipment-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = `Remove ${item}`;
    removeBtn.addEventListener('click', () => unequipSlot(slot));
    valueEl.appendChild(removeBtn);
  }

  equipmentBody.appendChild(labelEl);
  equipmentBody.appendChild(valueEl);
}

function unequipSlot(slot: EquipmentSlot): void {
  network.unequipItem(slot).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

function renderEquipment(): void {
  if (!myProfile) return;
  equipmentBody.innerHTML = '';
  for (const slot of EQUIPMENT_SLOTS) {
    renderEquipmentRow(slot, EQUIPMENT_SLOT_LABELS[slot], myProfile.equipment[slot]);
  }
}

// Item-hover tooltip text (item 17) — native `title` attribute, same
// no-component-needed approach as the Skills modal's name tooltip.
const ITEM_DESCRIPTIONS: Record<string, string> = {
  'bone dagger': 'A crude blade carved from bone. Equip it as a weapon for bonus damage and the dagger skill.',
  'bone shield': 'A plated bone shield. Equip it for a chance to block incoming hits.',
  torch: 'A carried light source. Equip it in place of a shield to see in the dark — burns out after 15 minutes of equipped use.',
  'wild goblin ear': "A wild goblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'goblin ear': "A goblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'hobgoblin ear': "A hobgoblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'wild skeleton bone': "A wild skeleton's bone. Consume it for exp and a higher chance of learning undead-monster resistance.",
  'skeleton bone': "A skeleton's bone. Consume it for exp and a higher chance of learning undead-monster resistance.",
  'zombie finger': "A zombie's severed finger. Consume it for exp.",
  'dragonborn scale': "A dragonborn's scale. Consume it for exp.",
  'slime residue': "A slime's residue. Consume it for exp.",
};

function itemTooltip(item: string): string {
  const description = ITEM_DESCRIPTIONS[item];
  return description ? `${description}\n\nClick to use, right-click to consume.` : 'Click to use, right-click to consume.';
}

function renderInventory(): void {
  inventoryList.innerHTML = '';
  const items = myProfile?.inventory ?? [];
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'inventory-empty';
    li.textContent = 'Empty — go loot something.';
    inventoryList.appendChild(li);
    return;
  }
  // Stack identical items into a single "item x3" line rather than a
  // repeated line per copy. The server's inventory stays a flat array
  // (it has no concept of stacks) — this is purely a display grouping;
  // clicking a stack acts on one instance (the first index sharing that
  // name), same as clicking any single unstacked item always did.
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const indices = groups.get(item);
    if (indices) indices.push(index);
    else groups.set(item, [index]);
  });

  for (const [item, indices] of groups) {
    const li = document.createElement('li');
    li.textContent = indices.length > 1 ? `${item} x${indices.length}` : item;
    li.className = 'inventory-item';
    li.title = itemTooltip(item);
    // Every group has at least one index (it's seeded with one on
    // creation above), so this is always defined.
    li.addEventListener('click', () => useInventoryItem(indices[0]!));
    // The browser's own right-click context menu is never useful here —
    // captured and replaced with a forced consume (see
    // game.gateway.ts's consumeItem), so an otherwise-equippable item
    // (a bone dagger, say) can be eaten for its exp instead of worn.
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      consumeInventoryItem(indices[0]!);
    });
    inventoryList.appendChild(li);
  }
}

function applyUseItemAck(ack: UseItemAck): void {
  if (!ack.ok) {
    if (ack.message) logCombatMessage(ack.message);
    return;
  }
  if (myProfile) {
    myProfile = {
      ...myProfile,
      inventory: ack.inventory ?? myProfile.inventory,
      equipment: ack.equipment ?? myProfile.equipment,
      consumeExp: ack.consumeExp ?? myProfile.consumeExp,
      skills: ack.skills ?? myProfile.skills,
    };
    refreshOpenModals();
    activeScene?.refreshEquipmentSprites();
  }
  const actionMessage = ack.action === 'equipped' ? 'You equip it.' : ack.action === 'unequipped' ? 'You remove it.' : 'You consume it.';
  logCombatMessage(actionMessage);
  if (ack.message) logCombatMessage(ack.message, 'level-up');
}

// Left-click asks the server to decide consume-vs-equip (see
// game.gateway.ts's useItem handler) — the client has no copy of that
// logic, it just reflects whatever the server did.
function useInventoryItem(index: number): void {
  network.useItem(index).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

// Right-click always forces a consume, even for an equippable item.
function consumeInventoryItem(index: number): void {
  network.consumeItem(index).then(applyUseItemAck).catch(() => {
    /* nothing to show */
  });
}

// ---------- Corpse loot modal (players, the training dummy, and monsters
// alike) ---------- a choice between "Grab all" and picking items one at
// a time. Autopilot bypasses this entirely (see applyMapState), grabbing
// straight away so automation doesn't stall on a modal.

let currentCorpseId: string | null = null;
let currentCorpseItems: string[] = [];
let currentCorpseKind: string | undefined;
let currentCorpseKilledBy: string | undefined;

function updateEatBrainsButton(): void {
  const canEatBrains = myProfile?.race === 'zombie' && currentCorpseKilledBy !== undefined && currentCorpseKilledBy === myProfile.username;
  corpseEatBrainsBtn.hidden = !canEatBrains;
  if (!canEatBrains || !myProfile) return;

  // Only known once worldTimeKnown (the first 'worldTime' broadcast) —
  // until then, assume ready rather than greying it out on a guess.
  const onCooldown = worldTimeKnown && currentWorldTick < myProfile.eatBrainsReadyAtTick;
  corpseEatBrainsBtn.disabled = onCooldown;
  corpseEatBrainsBtn.classList.toggle('on-cooldown', onCooldown);
  corpseEatBrainsBtn.title = onCooldown ? 'Eat Brains is still on cooldown' : '';
}

// Player (and training-dummy) corpses share the same Race-shaped `kind`
// as each other with no way to tell them apart — only a REAL monster
// corpse (kind is one of MONSTER_KINDS) can be sacrificed, matching the
// server's own check in handleSacrificeCorpse.
function updateSacrificeButton(): void {
  const canSacrifice = currentCorpseKind !== undefined && (MONSTER_KINDS as readonly string[]).includes(currentCorpseKind);
  corpseSacrificeBtn.hidden = !canSacrifice;
}

// A corpse no longer disappears once its last item is grabbed — it
// sticks around (see shared/types.ts's CorpseSnapshot) until its TTL or,
// for a monster corpse, sacrifice — so an empty item list just means
// nothing left to grab, not "close the modal".
function renderCorpseModal(): void {
  corpseItemList.innerHTML = '';
  corpseGrabAllBtn.hidden = currentCorpseItems.length === 0;
  if (currentCorpseItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'inventory-empty';
    li.textContent = 'Nothing left to grab.';
    corpseItemList.appendChild(li);
    return;
  }
  currentCorpseItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = 'inventory-item';
    li.title = 'Click to grab';
    li.addEventListener('click', () => grabCorpseItem(index));
    corpseItemList.appendChild(li);
  });
}

function openCorpseModal(corpseId: string, items: string[], kind: string, killedBy: string | undefined): void {
  closeAllModals();
  currentCorpseId = corpseId;
  currentCorpseItems = [...items];
  currentCorpseKind = kind;
  currentCorpseKilledBy = killedBy;
  corpseModalTitle.textContent = `${kind} corpse`;
  corpseModal.hidden = false;
  updateInputCaptured();
  updateEatBrainsButton();
  updateSacrificeButton();
  renderCorpseModal();
}

corpseSacrificeBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .sacrificeCorpse(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile && ack.gold !== undefined) {
        myProfile = { ...myProfile, gold: ack.gold };
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
      hideModal(corpseModal);
      updateInputCaptured();
    })
    .catch(() => {
      /* nothing to show */
    });
});

corpseEatBrainsBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .eatBrains(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile) {
        myProfile = {
          ...myProfile,
          hp: ack.hp ?? myProfile.hp,
          maxHp: ack.maxHp ?? myProfile.maxHp,
          mana: ack.mana ?? myProfile.mana,
          maxMana: ack.maxMana ?? myProfile.maxMana,
          movement: ack.movement ?? myProfile.movement,
          maxMovement: ack.maxMovement ?? myProfile.maxMovement,
        };
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
    })
    .catch(() => {
      /* nothing to show */
    });
});

function grabCorpseItem(index: number): void {
  if (!currentCorpseId) return;
  network
    .lootItem(currentCorpseId, index)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      const [item] = currentCorpseItems.splice(index, 1);
      if (myProfile && ack.inventory) {
        myProfile = { ...myProfile, inventory: ack.inventory };
        refreshOpenModals();
      }
      if (item) logCombatMessage(`You pick up the ${item}.`);
      renderCorpseModal();
    })
    .catch(() => {
      /* corpse likely already looted by someone else — nothing to show */
    });
}

corpseGrabAllBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .loot(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      logCombatMessage(`You pick up the ${currentCorpseItems.join(' and ')}.`);
      currentCorpseItems = [];
      if (myProfile && ack.inventory) {
        myProfile = { ...myProfile, inventory: ack.inventory };
        refreshOpenModals();
      }
      // The corpse itself now sticks around empty (see shared/types.ts's
      // CorpseSnapshot) — keep the modal open in case a monster corpse
      // is about to be sacrificed instead.
      renderCorpseModal();
    })
    .catch(() => {
      /* nothing to show */
    });
});

// ---------- Shop modal (a vendor's fixed item list, each with a Buy
// button) — vendors never move or restock, so there's nothing to poll;
// every purchase just re-renders against the same static item list.

let currentVendor: VendorSnapshot | null = null;

function renderShopModal(): void {
  shopGoldLine.textContent = `Your gold: ${myProfile?.gold ?? 0}`;
  shopItemList.innerHTML = '';
  if (!currentVendor) return;
  for (const item of currentVendor.items) {
    const li = document.createElement('li');
    li.className = 'shop-item';
    const label = document.createElement('span');
    label.textContent = `${item.label} — ${item.price} gold`;
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = 'Buy';
    buyBtn.addEventListener('click', () => buyVendorItem(item.label));
    li.appendChild(label);
    li.appendChild(buyBtn);
    shopItemList.appendChild(li);
  }
}

function openShopModal(vendor: VendorSnapshot): void {
  closeAllModals();
  currentVendor = vendor;
  shopModalTitle.textContent = vendor.name;
  shopModal.hidden = false;
  updateInputCaptured();
  renderShopModal();
}

function buyVendorItem(itemLabel: string): void {
  if (!currentVendor) return;
  network
    .buyItem(currentVendor.id, itemLabel)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile) {
        myProfile = {
          ...myProfile,
          inventory: ack.inventory ?? myProfile.inventory,
          gold: ack.gold ?? myProfile.gold,
        };
        refreshOpenModals();
      }
      if (ack.message) logCombatMessage(ack.message);
      renderShopModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

// ---------- Target info modal (double-click a player/npc/monster — item
// 12) ---------- name, equipment/carried items, and a "consideration"
// message comparing the target's level to your own. This project has no
// prior "consider" mechanic to match (the text game doesn't have one
// either) — these tiers/wording are new, not ported from anywhere.

function considerationMessage(viewerLevel: number, targetLevel: number): string {
  const diff = targetLevel - viewerLevel;
  if (diff <= -5) return 'This would be no challenge at all for you.';
  if (diff <= -2) return 'You would win this fight easily.';
  if (diff <= 1) return 'This would be a fair fight.';
  if (diff <= 4) return 'This could go either way — be careful.';
  return 'You would likely be defeated.';
}

function openTargetInfoModal(kind: 'player' | 'npc' | 'monster', id: string, sprite: Phaser.GameObjects.Sprite): void {
  closeAllModals();
  const label = (sprite.getData('label') as string | undefined) ?? id;
  const level = (sprite.getData('level') as number | undefined) ?? 1;

  targetInfoTitle.textContent = label;
  targetInfoBody.innerHTML = '';
  appendStatRow(targetInfoBody, 'Level', level);

  if (kind === 'player') {
    const equipment = (sprite.getData('equipment') as Record<string, string> | undefined) ?? {};
    for (const slot of EQUIPMENT_SLOTS) {
      appendStatRow(targetInfoBody, EQUIPMENT_SLOT_LABELS[slot], equipment[slot] ?? '(none)');
    }
  } else if (kind === 'monster') {
    const carried = (sprite.getData('carriedItems') as string[] | undefined) ?? [];
    appendStatRow(targetInfoBody, 'Carrying', carried.length > 0 ? carried.join(', ') : '(nothing)');
  }

  targetInfoConsideration.textContent = myProfile ? considerationMessage(myProfile.level, level) : '';
  targetInfoModal.hidden = false;
  updateInputCaptured();
}

function refreshOpenModals(): void {
  if (!charSheetModal.hidden) renderCharSheet();
  if (!inventoryModal.hidden) renderInventory();
  if (!skillsModal.hidden) renderSkills();
  if (!equipmentModal.hidden) renderEquipment();
  if (!shopModal.hidden) renderShopModal();
}

// Hides a modal without any side effects beyond that — used both by the
// "close everything else before opening this one" path and by the
// autopilot-specific dismissal path below (which additionally stops any
// active hunt).
function hideModal(modal: HTMLDivElement): void {
  modal.hidden = true;
  if (modal === autopilotModal) autopilotInput.blur();
}

function closeAllModals(): void {
  for (const modal of ALL_MODALS) hideModal(modal);
  updateInputCaptured();
}

// Char sheet / inventory / skills / equipment: plain toggle, closing any
// OTHER open modal first. Deliberately does NOT touch autopilot tracking
// — opening your inventory mid-hunt shouldn't cancel it.
function toggleModal(modal: HTMLDivElement): void {
  const wasOpen = !modal.hidden;
  closeAllModals();
  if (wasOpen) return;
  modal.hidden = false;
  updateInputCaptured();
  if (modal === charSheetModal) renderCharSheet();
  if (modal === inventoryModal) renderInventory();
  if (modal === skillsModal) renderSkills();
  if (modal === equipmentModal) renderEquipment();
  if (modal === mapModal) openMapModal();
}

charSheetBtn.addEventListener('click', () => toggleModal(charSheetModal));
inventoryBtn.addEventListener('click', () => toggleModal(inventoryModal));
skillsBtn.addEventListener('click', () => toggleModal(skillsModal));
equipmentBtn.addEventListener('click', () => toggleModal(equipmentModal));
mapBtn.addEventListener('click', () => toggleModal(mapModal));

// ---------- Map modal: Here / World Map / Who / Where ----------

type MapTab = 'current' | 'world' | 'who' | 'where';
let activeMapTab: MapTab = 'current';

function updateMapTabButtons(): void {
  mapTabCurrentBtn.classList.toggle('active', activeMapTab === 'current');
  mapTabWorldBtn.classList.toggle('active', activeMapTab === 'world');
  mapTabWhoBtn.classList.toggle('active', activeMapTab === 'who');
  mapTabWhereBtn.classList.toggle('active', activeMapTab === 'where');
  // "the starting tab should be the name of the World they are in" — the
  // first tab's label is the player's current map, not a fixed word.
  mapTabCurrentBtn.textContent = activeScene?.getCurrentMap() ?? 'Here';
}

function switchMapTab(tab: MapTab): void {
  activeMapTab = tab;
  updateMapTabButtons();
  renderMapTab();
}
mapTabCurrentBtn.addEventListener('click', () => switchMapTab('current'));
mapTabWorldBtn.addEventListener('click', () => switchMapTab('world'));
mapTabWhoBtn.addEventListener('click', () => switchMapTab('who'));
mapTabWhereBtn.addEventListener('click', () => switchMapTab('where'));

// Opening the modal always resets back to the "current world" tab.
function openMapModal(): void {
  activeMapTab = 'current';
  updateMapTabButtons();
  renderMapTab();
}

function renderConnectionsList(mapName: MapName): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'map-connections';
  const def = MAPS[mapName];
  if (def.exits.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No connections.';
    list.appendChild(li);
  }
  for (const exit of def.exits) {
    const li = document.createElement('li');
    li.textContent = `${exit.direction} → ${exit.toMap}`;
    list.appendChild(li);
  }
  return list;
}

function renderMapTab(): void {
  mapBody.innerHTML = '';
  if (activeMapTab === 'current') {
    const mapName = activeScene?.getCurrentMap() ?? 'Great Plains';
    mapBody.appendChild(renderConnectionsList(mapName));
  } else if (activeMapTab === 'world') {
    for (const name of MAP_NAMES) {
      const heading = document.createElement('div');
      heading.className = 'stat-label';
      heading.textContent = name;
      mapBody.appendChild(heading);
      mapBody.appendChild(renderConnectionsList(name));
    }
  } else {
    renderPlayerListTab(activeMapTab);
  }
}

function renderPlayerListTab(tab: 'who' | 'where'): void {
  const loading = document.createElement('div');
  loading.textContent = 'Loading...';
  mapBody.appendChild(loading);

  network
    .who()
    .then((res) => {
      if (activeMapTab !== tab) return; // the tab changed while this was in flight
      const currentMap = activeScene?.getCurrentMap();
      const players: WhoEntry[] = tab === 'where' ? res.players.filter((p) => p.map === currentMap) : res.players;
      mapBody.innerHTML = '';
      const list = document.createElement('ul');
      list.className = 'map-connections';
      if (players.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nobody here.';
        list.appendChild(li);
      }
      for (const p of players) {
        const li = document.createElement('li');
        li.textContent = tab === 'who' ? `${p.username} (Lv ${p.level}) — ${p.map}` : `${p.username} (Lv ${p.level})`;
        list.appendChild(li);
      }
      mapBody.appendChild(list);
    })
    .catch(() => {
      loading.textContent = 'Could not load.';
    });
}

// Dismissing the PROMPT modal specifically (X, click-outside, or 'p'
// again while it's open) both closes it and ends any active hunt — per
// the explicit request that dismissing it "should close and end
// tracking". Submitting a command (Enter, below) is a separate path that
// closes the modal WITHOUT stopping anything, since it's what starts the
// hunt in the first place.
function dismissAutopilotModal(): void {
  hideModal(autopilotModal);
  updateInputCaptured();
  activeScene?.stopAutopilot('Autopilot stopped.');
}

function openAutopilotModal(): void {
  closeAllModals();
  autopilotModal.hidden = false;
  autopilotInput.value = '';
  autopilotInput.focus();
  updateInputCaptured();
}

function toggleAutopilotModal(): void {
  if (!autopilotModal.hidden) {
    dismissAutopilotModal();
    return;
  }
  openAutopilotModal();
}
autopilotBtn.addEventListener('click', toggleAutopilotModal);

for (const modal of ALL_MODALS) {
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;
    if (modal === autopilotModal) {
      dismissAutopilotModal();
    } else {
      hideModal(modal);
      updateInputCaptured();
    }
  });
}
for (const btn of document.querySelectorAll<HTMLButtonElement>('.modal-close')) {
  const modal = btn.closest('.modal') as HTMLDivElement | null;
  btn.addEventListener('click', () => {
    if (modal === autopilotModal) {
      dismissAutopilotModal();
    } else {
      closeAllModals();
    }
  });
}

function parseAutopilotPrompt(text: string): MonsterKind | null {
  const lower = text.toLowerCase();
  if (lower.includes('skeleton')) return 'wild skeleton';
  if (
    lower.includes('goblin') ||
    lower.includes('monster') ||
    lower.includes('roam') ||
    lower.includes('kill') ||
    lower.includes('attack') ||
    lower.includes('punch') ||
    lower.includes('fight')
  ) {
    return 'wild goblin';
  }
  return null;
}

// No stopPropagation here — an earlier version called it unconditionally,
// which (since focus stayed on this input even after being hidden)
// silently swallowed EVERY subsequent keystroke, including WASD, before
// it ever reached Phaser's keyboard manager. The document-level listener
// below already ignores keys while a modal is open, so blocking
// propagation here was both redundant and the actual cause of "movement
// stopped working after using the prompt".
autopilotInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const text = autopilotInput.value.trim();
    hideModal(autopilotModal);
    updateInputCaptured();
    if (!text) return;
    const kind = parseAutopilotPrompt(text);
    if (!kind) {
      logCombatMessage(`Autopilot: didn't recognize "${text}" — try mentioning "wild goblin" or "wild skeleton".`);
      return;
    }
    activeScene?.startAutopilot(kind);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    dismissAutopilotModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (gameRoot.hidden) return;
  const target = e.target as HTMLElement;
  // Only bail out while actually typing somewhere (the autopilot prompt's
  // input, say) — NOT whenever any modal happens to be open, since that
  // would also block the very shortcut that's supposed to CLOSE the open
  // modal (e.g. pressing 'c' again to close the char sheet).
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape') {
    activeScene?.stopAutopilot('Autopilot stopped.');
    return;
  }

  if (e.key === 'Enter' && !inputCaptured) {
    e.preventDefault();
    openChatInput();
    return;
  }

  // "/" almost always means "I want to type a command" (item 9) — jump
  // straight to Chat with the "/" already typed, rather than making the
  // player open chat and type it themselves.
  if (e.key === '/' && !inputCaptured) {
    e.preventDefault();
    openChatInputWithSlash();
    return;
  }

  const key = e.key.toLowerCase();
  if (key === 'c') {
    e.preventDefault();
    toggleModal(charSheetModal);
  } else if (key === 'i') {
    e.preventDefault();
    toggleModal(inventoryModal);
  } else if (key === 'k') {
    e.preventDefault();
    toggleModal(skillsModal);
  } else if (key === 'e') {
    e.preventDefault();
    toggleModal(equipmentModal);
  } else if (key === 'm') {
    e.preventDefault();
    toggleModal(mapModal);
  } else if (key === 'p') {
    e.preventDefault();
    toggleAutopilotModal();
  }
});

const network = new NetworkManager(SERVER_URL);

let mode: 'login' | 'register' = 'login';
function setMode(next: 'login' | 'register'): void {
  mode = next;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  raceLabel.hidden = mode !== 'register';
  submitBtn.textContent = mode === 'register' ? 'Register' : 'Login';
}
tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));
setMode('login');

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void handleAuthSubmit();
});

async function handleAuthSubmit(): Promise<void> {
  authError.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const race = raceSelect.value;

  try {
    if (mode === 'register') {
      await network.register(username, password, race);
    } else {
      await network.login(username, password);
    }
  } catch (err) {
    authError.textContent = err instanceof Error ? err.message : 'Request failed.';
    return;
  }

  startGame();
}

// ---------- Game ----------

// Facing IS the sheet's own row now — down/up/left/right are each real,
// fully distinct frames (see characterSprites.ts), not a 3-row sheet with
// a flipped "side" shared between left and right.
type Facing = FacingGroup;

function floorTextureFor(mapName: MapName): string {
  if (mapName === 'Labyrinth') return 'stone';
  if (mapName === 'Floro' || mapName === 'Kortho') return 'concrete';
  return 'grass';
}

function facingForDirection(direction: Direction): Facing {
  if (direction === 'north') return 'up';
  if (direction === 'south') return 'down';
  return direction === 'west' ? 'left' : 'right';
}

function drawStatBar(bar: Phaser.GameObjects.Graphics, ratio: number, color: number): void {
  bar.clear();
  bar.fillStyle(0x000000, 0.55);
  bar.fillRect(-HP_BAR_WIDTH / 2, 0, HP_BAR_WIDTH, HP_BAR_HEIGHT);
  bar.fillStyle(color, 1);
  bar.fillRect(-HP_BAR_WIDTH / 2 + 1, 1, Math.max(0, (HP_BAR_WIDTH - 2) * ratio), HP_BAR_HEIGHT - 2);
}

function drawHpBar(bar: Phaser.GameObjects.Graphics, hp: number, maxHp: number): void {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const color = ratio > 0.5 ? 0x3ecf5e : ratio > 0.25 ? 0xd9a53c : 0xd9403c;
  drawStatBar(bar, ratio, color);
}

const MANA_BAR_COLOR = 0x4a8fd4;
const MOVEMENT_BAR_COLOR = 0xd4c24a;
const BAR_STACK_GAP = 2;

let gameInstance: Phaser.Game | null = null;
let activeScene: WorldScene | null = null;

class WorldScene extends Phaser.Scene {
  private network!: NetworkManager;
  private player!: Phaser.GameObjects.Sprite;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerManaBar!: Phaser.GameObjects.Graphics;
  private playerMovementBar!: Phaser.GameObjects.Graphics;
  private playerWeaponSprite!: Phaser.GameObjects.Sprite;
  private playerShieldSprite!: Phaser.GameObjects.Sprite;
  private playerTorchSprite!: Phaser.GameObjects.Sprite;
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprites: Phaser.GameObjects.Sprite[] = [];
  private race: Race = 'goblin';
  // A slime's current mimicked appearance (see shared/skills.ts's
  // MIMIC_SKILL/REVERT_SKILL) — overrides race for texture/animation
  // lookups ONLY (see displayKind); race itself is always the true,
  // mechanical one.
  private mimicForm: (Race | MonsterKind) | null = null;
  private facing: Facing = 'down';
  private currentMap: MapName = 'Great Plains';
  private row = 0;
  private col = 0;
  private myUsername = '';
  private isMoving = false;
  private isPunching = false;
  private lastMoveAt = 0;
  private moveKeys!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

  // Other connected players, static NPCs, wild monsters, and lootable
  // corpses sharing the current map — collision itself is enforced
  // server-side; these sprites are just the client's view of who else is
  // standing where (and what right-click/left-click can target). Each
  // living entity carries a small HP bar (a Graphics object stashed via
  // setData) repositioned every frame in update() so it tracks tweened
  // movement smoothly.
  private otherPlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private monsterSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private corpseSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Shopkeepers etc. — static and never a combat target, so no HP bar and
  // no occupancy/collision handling beyond what the server already does.
  private vendorSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // The decorative shopfront stall standing in front of each vendor —
  // tracked separately purely so renderMap's map-transition cleanup can
  // destroy it alongside the vendor sprite itself.
  private vendorFrontSprites = new Map<string, Phaser.GameObjects.Sprite>();
  // Left-click target (see setTarget/handleLeftClick) — id is a username
  // for a player, otherwise the npc/monster's own id. Cleared whenever
  // the target dies/leaves/disconnects (see applyMapState's cleanup
  // loops).
  private targetKind: 'player' | 'npc' | 'monster' | null = null;
  private targetId: string | null = null;
  // Set when a right-click/action-bar skill use targets something too far
  // to hit yet (item 12) — each move-cooldown tick walks one step closer
  // (see runApproachTick), then automatically engages once adjacent.
  private approach: { kind: 'player' | 'npc' | 'monster'; id: string; skill: string } | null = null;
  private lastApproachMoveAt = 0;
  // Great-Plains-only background dressing — server-enforced collision
  // (see shared/trees.ts), but no per-row depth sorting against
  // characters (always drawn behind them; see renderMap).
  private treeSprites: Phaser.GameObjects.Sprite[] = [];
  // Labyrinth-only decorative wall torches (item 7) — recreated on every
  // renderMap the same way treeSprites are, just from
  // torchWallPositionsFor instead of treePositionsFor.
  private wallTorchSprites: Phaser.GameObjects.Sprite[] = [];

  private autopilotActive = false;
  private autopilotTargetKind: MonsterKind | null = null;
  private hasRenderedMap = false;

  constructor() {
    super('world');
  }

  init(data: { network: NetworkManager }): void {
    this.network = data.network;
  }

  preload(): void {
    this.load.svg('grass', '/grass-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('stone', '/stone-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('concrete', '/concrete-tile.svg', { width: TILE_SIZE, height: TILE_SIZE });
    this.load.svg('door', '/door.svg', { width: 40, height: 48 });
    this.load.svg(TREE_TEXTURE_KEY, '/tree.svg', { width: 48, height: 64 });
    this.load.svg(DAGGER_TEXTURE_KEY, '/dagger.svg', { width: 16, height: 16 });
    this.load.svg(BONE_SHIELD_TEXTURE_KEY, '/bone-shield.svg', { width: 16, height: 16 });
    this.load.svg(TORCH_HELD_TEXTURE_KEY, '/torch.svg', { width: 16, height: 20 });
    this.load.svg('shopfront', '/shopfront.svg', { width: 40, height: 36 });
    createWallTorchTexture(this);
    preloadCharacterSprites(this);
  }

  create(): void {
    createCharacterAnims(this);
    defineBodyPartFrames(this);

    this.player = this.add.sprite(0, 0, textureKeyFor('goblin'), idleFrameFor('goblin', 'down')).setScale(CHAR_SCALE);
    this.playerHpBar = this.add.graphics();
    this.playerManaBar = this.add.graphics();
    this.playerMovementBar = this.add.graphics();
    this.playerWeaponSprite = this.add.sprite(0, 0, DAGGER_TEXTURE_KEY).setVisible(false).setDepth(1);
    this.playerShieldSprite = this.add.sprite(0, 0, BONE_SHIELD_TEXTURE_KEY).setVisible(false).setDepth(1);
    this.playerTorchSprite = this.add.sprite(0, 0, TORCH_HELD_TEXTURE_KEY).setVisible(false).setDepth(1);

    // A 100x100 Great Plains is far too big to fit on screen at once —
    // the camera follows the player instead, clamped to each map's own
    // pixel bounds (set per-map in renderMap, since maps differ in size).
    this.cameras.main.startFollow(this.player, true, 1, 1);

    const keyboard = this.input.keyboard!;
    this.moveKeys = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.cursorKeys = keyboard.createCursorKeys();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (inputCaptured) return;
      if (pointer.rightButtonDown()) this.handleRightClick(pointer);
      else if (pointer.leftButtonDown()) this.handleLeftClick(pointer);
    });
    // A sword cursor over an enemy (item 10) — monsters specifically, not
    // other players or the friendly training dummy. Individual sprites
    // (vendors, corpses) already get Phaser's own pointer cursor via
    // `useHandCursor`; this is a manual check since monster sprites
    // aren't `setInteractive` themselves (see findTargetableAt's own
    // bounds-based hit-testing).
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (inputCaptured) {
        this.game.canvas.style.cursor = '';
        return;
      }
      const overEnemy = [...this.monsterSprites.values()].some((s) => s.getBounds().contains(pointer.worldX, pointer.worldY));
      this.game.canvas.style.cursor = overEnemy ? SWORD_CURSOR : '';
    });

    // A window resize can cross the "map fits in the viewport" threshold
    // for the SAME map (see applyCameraBounds) — re-apply whenever it does.
    this.scale.on('resize', () => {
      if (!this.floorTile) return;
      const def = getMap(this.currentMap);
      this.applyCameraBounds(def.cols * TILE_SIZE, def.rows * TILE_SIZE);
    });

    this.network.addEventListener('sync', ((e: CustomEvent<SyncPayload>) => this.applySync(e.detail.player)) as EventListener);
    this.network.addEventListener('map:state', ((e: CustomEvent<MapStatePayload>) => this.applyMapState(e.detail)) as EventListener);
    this.network.addEventListener('punch', ((e: CustomEvent<PunchPayload>) => this.applyRemotePunch(e.detail)) as EventListener);
    this.network.addEventListener('combat', ((e: CustomEvent<CombatEventPayload>) => this.applyCombatEvent(e.detail)) as EventListener);
    this.network.addEventListener('chat', ((e: CustomEvent<ChatPayload>) => logChatMessage(e.detail.username, e.detail.message)) as EventListener);
    this.network.addEventListener('statTick', ((e: CustomEvent<StatTickPayload>) => this.applyOwnStats(e.detail)) as EventListener);
    this.network.addEventListener('worldTime', ((e: CustomEvent<WorldTimePayload>) => updateWorldHour(e.detail.hour, e.detail.tick)) as EventListener);
    this.network.addEventListener('kicked', ((e: CustomEvent<KickedPayload>) => {
      alert(e.detail.message);
      window.location.reload();
    }) as EventListener);

    activeScene = this;

    // Only connect the socket now that every listener above is actually
    // registered — startGame() used to connect immediately after
    // game.scene.add(), racing this scene's own preload (several
    // spritesheet fetches) to finish booting. On a fast/cached load the
    // server's very first 'sync' could arrive and fire into the void
    // before anything was listening for it (EventTarget doesn't replay
    // missed events), permanently starving this client of its own
    // race/position and — since applyMapState also refuses to do
    // anything until applySync has set myUsername — every monster/NPC/
    // other-player render too. This was the "always a goblin, no
    // monsters, screen never lights up" bug.
    this.network.connectSocket();
  }

  update(): void {
    this.repositionHpBars();
    this.updateDarkFog();
    applyDaynightTint(this.hasFullVision());

    if (this.isMoving || this.isPunching) return;

    if (this.autopilotActive) {
      if (this.manualMoveKeyDown()) {
        this.stopAutopilot('Autopilot stopped (manual movement).');
      } else {
        this.runAutopilotTick();
        return;
      }
    }

    if (this.approach) {
      if (this.manualMoveKeyDown()) {
        this.approach = null;
      } else {
        this.runApproachTick();
        return;
      }
    }

    if (inputCaptured) return;

    const now = Date.now();
    if (now - this.lastMoveAt < MOVE_COOLDOWN_MS) return;

    let direction: Direction | undefined;
    if (this.moveKeys.a.isDown || this.cursorKeys.left.isDown) direction = 'west';
    else if (this.moveKeys.d.isDown || this.cursorKeys.right.isDown) direction = 'east';
    else if (this.moveKeys.w.isDown || this.cursorKeys.up.isDown) direction = 'north';
    else if (this.moveKeys.s.isDown || this.cursorKeys.down.isDown) direction = 'south';

    if (!direction) return;
    this.lastMoveAt = now;
    this.attemptMove(direction);
  }

  // See updateInputCaptured's comment — Phaser's global keyboard capture
  // preventDefaults on keycode alone, ignoring DOM focus, so it has to be
  // switched off while any HTML modal (with or without a text input) is
  // open and back on for normal play.
  setKeyCaptureEnabled(enabled: boolean): void {
    const manager = this.input.keyboard?.manager;
    if (manager) manager.preventDefault = enabled;
  }

  // Read by the map modal's "current world" tab/label — this.currentMap
  // is only ever updated inside renderMap, so it's always the map that's
  // ACTUALLY rendered right now, unlike myProfile.map (only refreshed on
  // 'sync', not on every walked transition).
  getCurrentMap(): MapName {
    return this.currentMap;
  }

  // Called after an equip/unequip so the held-weapon/shield overlays
  // update immediately rather than waiting for the next sync/map:state.
  refreshEquipmentSprites(): void {
    if (!myProfile) return;
    this.updateOwnWeaponSprite(Boolean(myProfile.equipment.weapon));
    this.updateOwnShieldSprite(myProfile.equipment.shield === 'bone shield');
    this.updateOwnTorchSprite(myProfile.equipment.shield === TORCH_ITEM);
  }

  // The local player's own weapon overlay uses the dedicated
  // playerWeaponSprite FIELD (repositioned every frame in
  // repositionHpBars), unlike the generic getData-based ensureWeaponSprite
  // used for other players/npcs/monsters. Calling ensureWeaponSprite on
  // this.player directly used to create a SEPARATE, second sprite (since
  // this.player had no 'weaponSprite' data key pointing at the field) —
  // that phantom only ever got repositioned when this method itself ran
  // (sync/equip events), never during ordinary movement, while the real,
  // per-frame-tracked field stayed permanently invisible. That was the
  // "dagger didn't move with me, only jumped on sit/rest" bug.
  private updateOwnWeaponSprite(hasWeapon: boolean): void {
    this.playerWeaponSprite.setVisible(hasWeapon);
    this.repositionWeaponSprite(this.playerWeaponSprite, this.player, this.facing);
  }

  private updateOwnShieldSprite(hasShield: boolean): void {
    this.playerShieldSprite.setVisible(hasShield);
    this.repositionShieldSprite(this.playerShieldSprite, this.player, this.facing);
  }

  // A torch fills the same off-hand slot as a bone shield (see
  // shared/lighting.ts) but is a completely different held item, so it
  // gets its own overlay sprite/visibility rather than reusing the
  // shield one — the two are mutually exclusive by construction (only
  // one item can occupy the shield slot), but there's no reason to
  // conflate them just because they share a slot. Reuses the shield's
  // own off-hand positioning math (see repositionShieldSprite) since
  // it's the same held position either way (item 21).
  private updateOwnTorchSprite(hasTorch: boolean): void {
    this.playerTorchSprite.setVisible(hasTorch);
    this.repositionShieldSprite(this.playerTorchSprite, this.player, this.facing);
  }

  // Sleeping is a static 90-degree "lying down" rotation (no dedicated
  // sprite art). Resting/sitting is a genuine looping animation instead —
  // a gentle squash-and-stretch "settling down" breathing tween — since
  // there's no separate sit-frame art either, but a rotation would look
  // wrong for "sitting up". Only re-applied when the state actually
  // changes (tracked via getData) so repeated map:state/sync ticks for
  // an unchanged restState don't restart the tween from scratch.
  private applyRestPose(sprite: Phaser.GameObjects.Sprite, restState: RestState, baseScale: number): void {
    if (sprite.getData('restState') === restState) return;
    sprite.setData('restState', restState);
    this.tweens.killTweensOf(sprite);
    sprite.setAngle(0);
    sprite.setScale(baseScale);

    if (restState === 'sleeping') {
      sprite.setAngle(90);
    } else if (restState === 'resting') {
      this.tweens.add({
        targets: sprite,
        scaleY: baseScale * 0.82,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private manualMoveKeyDown(): boolean {
    return (
      this.moveKeys.a.isDown ||
      this.moveKeys.d.isDown ||
      this.moveKeys.w.isDown ||
      this.moveKeys.s.isDown ||
      this.cursorKeys.left.isDown ||
      this.cursorKeys.right.isDown ||
      this.cursorKeys.up.isDown ||
      this.cursorKeys.down.isDown
    );
  }

  // ---------- Autopilot: a simple keyword-triggered "roam and punch the
  // nearest matching monster" loop. Not real language understanding —
  // just enough parsing (see parseAutopilotPrompt) to pick a monster kind
  // out of the typed sentence, then a greedy chase: close the bigger of
  // the row/col gaps each step, and punch once actually adjacent. ----------

  startAutopilot(targetKind: MonsterKind): void {
    this.autopilotActive = true;
    this.autopilotTargetKind = targetKind;
    autopilotStatusEl.hidden = false;
    autopilotStatusEl.textContent = `Autopilot: hunting ${targetKind}s (Esc to stop)`;
    logCombatMessage(`Autopilot engaged: hunting ${targetKind}s.`);
  }

  stopAutopilot(reason?: string): void {
    if (!this.autopilotActive) return;
    this.autopilotActive = false;
    this.autopilotTargetKind = null;
    autopilotStatusEl.hidden = true;
    if (reason) logCombatMessage(reason);
  }

  private nearestMonsterOfKind(kind: MonsterKind): { row: number; col: number } | null {
    let best: { row: number; col: number } | null = null;
    let bestDist = Infinity;
    for (const sprite of this.monsterSprites.values()) {
      if (sprite.getData('kind') !== kind) continue;
      const row = sprite.getData('row') as number;
      const col = sprite.getData('col') as number;
      const dist = Math.abs(row - this.row) + Math.abs(col - this.col);
      if (dist < bestDist) {
        bestDist = dist;
        best = { row, col };
      }
    }
    return best;
  }

  private runAutopilotTick(): void {
    const now = Date.now();
    if (now - this.lastMoveAt < MOVE_COOLDOWN_MS) return;

    const target = this.nearestMonsterOfKind(this.autopilotTargetKind!);
    if (!target) {
      this.stopAutopilot(`Autopilot: no ${this.autopilotTargetKind}s left here — stopping.`);
      return;
    }

    const dRow = target.row - this.row;
    const dCol = target.col - this.col;
    const adjacentOnAnAxis = (dRow === 0 && Math.abs(dCol) === 1) || (dCol === 0 && Math.abs(dRow) === 1);

    this.lastMoveAt = now;
    if (adjacentOnAnAxis) {
      const direction: Direction = dRow !== 0 ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
      this.performPunch(direction);
      return;
    }

    // Greedy step toward the target along whichever axis has the bigger
    // gap; if a step is ever rejected (e.g. something's in the way), the
    // next tick just re-evaluates from wherever we ended up.
    const direction: Direction =
      Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
    this.attemptMove(direction);
  }

  private spriteMapFor(kind: 'player' | 'npc' | 'monster'): Map<string, Phaser.GameObjects.Sprite> {
    return kind === 'player' ? this.otherPlayers : kind === 'npc' ? this.npcSprites : this.monsterSprites;
  }

  // Right-click and the action bar both funnel through here (item 12):
  // if the target's already adjacent, throw the attack now; otherwise
  // start (or keep) walking toward it and let runApproachTick retry once
  // in range. Doesn't worry about obstacles — same "you navigate around
  // doors/walls yourself" tradeoff as autopilot's own greedy stepping.
  private tryEngage(kind: 'player' | 'npc' | 'monster', id: string, skill: string): void {
    const sprite = this.spriteMapFor(kind).get(id);
    if (!sprite) {
      this.approach = null;
      logCombatMessage('Your target is no longer here.');
      return;
    }

    const targetRow = sprite.getData('row') as number;
    const targetCol = sprite.getData('col') as number;
    const dRow = targetRow - this.row;
    const dCol = targetCol - this.col;

    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      this.approach = null;
      const direction: Direction = dRow === -1 ? 'north' : dRow === 1 ? 'south' : dCol === -1 ? 'west' : 'east';
      if (skill === PUNCH_SKILL || skill === DAGGER_SKILL) this.performPunch(direction);
      else this.performSkillAttack(direction, skill);
      return;
    }

    this.approach = { kind, id, skill };
  }

  private runApproachTick(): void {
    if (!this.approach) return;
    const now = Date.now();
    if (now - this.lastApproachMoveAt < MOVE_COOLDOWN_MS) return;
    if (this.isMoving || this.isPunching) return;

    const { kind, id, skill } = this.approach;
    const sprite = this.spriteMapFor(kind).get(id);
    if (!sprite) {
      this.approach = null;
      logCombatMessage('Your target is no longer here.');
      return;
    }

    const targetRow = sprite.getData('row') as number;
    const targetCol = sprite.getData('col') as number;
    const dRow = targetRow - this.row;
    const dCol = targetCol - this.col;

    this.lastApproachMoveAt = now;
    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      this.approach = null;
      this.tryEngage(kind, id, skill);
      return;
    }

    const direction: Direction =
      Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'north' : 'south') : dCol < 0 ? 'west' : 'east';
    this.attemptMove(direction);
  }

  private repositionHpBars(): void {
    this.playerHpBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y);
    this.playerManaBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y + HP_BAR_HEIGHT + BAR_STACK_GAP);
    this.playerMovementBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y + (HP_BAR_HEIGHT + BAR_STACK_GAP) * 2);
    this.repositionWeaponSprite(this.playerWeaponSprite, this.player, this.facing);
    this.repositionShieldSprite(this.playerShieldSprite, this.player, this.facing);
    this.repositionShieldSprite(this.playerTorchSprite, this.player, this.facing);
    for (const sprite of this.otherPlayers.values()) this.repositionBarFor(sprite);
    for (const sprite of this.npcSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.monsterSprites.values()) this.repositionBarFor(sprite);
  }

  private repositionBarFor(sprite: Phaser.GameObjects.Sprite): void {
    const bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    bar?.setPosition(sprite.x, sprite.y + HP_BAR_OFFSET_Y);
    const weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (weaponSprite) this.repositionWeaponSprite(weaponSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
    const shieldSprite = sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined;
    if (shieldSprite) this.repositionShieldSprite(shieldSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
    const torchSprite = sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined;
    if (torchSprite) this.repositionShieldSprite(torchSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
  }

  // Own hp/mana/movement bars are a 3-bar stack (item request: show all
  // three above the player, not just hp) — other players/NPCs/monsters
  // keep the single hp-only bar, since NpcSnapshot/MonsterSnapshot don't
  // carry mana/movement at all.
  private updateOwnBars(): void {
    if (!myProfile) return;
    drawHpBar(this.playerHpBar, myProfile.hp, myProfile.maxHp);
    drawStatBar(this.playerManaBar, myProfile.maxMana > 0 ? myProfile.mana / myProfile.maxMana : 0, MANA_BAR_COLOR);
    drawStatBar(
      this.playerMovementBar,
      myProfile.maxMovement > 0 ? myProfile.movement / myProfile.maxMovement : 0,
      MOVEMENT_BAR_COLOR
    );
  }

  private ensureHpBar(sprite: Phaser.GameObjects.Sprite, hp: number, maxHp: number): void {
    let bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    if (!bar) {
      bar = this.add.graphics();
      sprite.setData('hpBar', bar);
    }
    drawHpBar(bar, hp, maxHp);
  }

  // A fixed offset per facing direction — not aligned to individual
  // animation frames, just a reasonable "held near the hand" position.
  private weaponOffsetFor(facing: Facing): { x: number; y: number } {
    switch (facing) {
      case 'down':
        return { x: 10, y: 6 };
      case 'up':
        return { x: -10, y: -8 };
      case 'left':
        return { x: -13, y: 2 };
      case 'right':
        return { x: 13, y: 2 };
    }
  }

  private repositionWeaponSprite(weaponSprite: Phaser.GameObjects.Sprite, owner: Phaser.GameObjects.Sprite, facing: Facing): void {
    const offset = this.weaponOffsetFor(facing);
    weaponSprite.setPosition(owner.x + offset.x, owner.y + offset.y);
  }

  // Shows/hides a player's held-weapon overlay based on whether their
  // weapon slot is filled — called for self on every profile update and
  // for other players whenever their snapshot arrives.
  private ensureWeaponSprite(sprite: Phaser.GameObjects.Sprite, hasWeapon: boolean, facing: Facing): void {
    let weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!weaponSprite) {
      weaponSprite = this.add.sprite(sprite.x, sprite.y, DAGGER_TEXTURE_KEY).setDepth(1);
      sprite.setData('weaponSprite', weaponSprite);
    }
    sprite.setData('facing', facing);
    weaponSprite.setVisible(hasWeapon);
    this.repositionWeaponSprite(weaponSprite, sprite, facing);
  }

  // The shield overlay's offset is the weapon's own, mirrored — the
  // opposite arm from whatever's holding the weapon.
  private shieldOffsetFor(facing: Facing): { x: number; y: number } {
    const weapon = this.weaponOffsetFor(facing);
    return { x: -weapon.x, y: weapon.y };
  }

  private repositionShieldSprite(shieldSprite: Phaser.GameObjects.Sprite, owner: Phaser.GameObjects.Sprite, facing: Facing): void {
    const offset = this.shieldOffsetFor(facing);
    shieldSprite.setPosition(owner.x + offset.x, owner.y + offset.y);
  }

  // Same shape as ensureWeaponSprite, but only for an actual "bone
  // shield" — a torch fills the same equipment slot (see
  // shared/lighting.ts) but isn't a shield and shouldn't render one.
  private ensureShieldSprite(sprite: Phaser.GameObjects.Sprite, hasShield: boolean, facing: Facing): void {
    let shieldSprite = sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!shieldSprite) {
      shieldSprite = this.add.sprite(sprite.x, sprite.y, BONE_SHIELD_TEXTURE_KEY).setDepth(1);
      sprite.setData('shieldSprite', shieldSprite);
    }
    shieldSprite.setVisible(hasShield);
    this.repositionShieldSprite(shieldSprite, sprite, facing);
  }

  // Same shape as ensureShieldSprite, for a torch instead (item 21) — the
  // same off-hand slot, a different held item, so it's its own overlay
  // rather than reusing the shield one (see updateOwnTorchSprite).
  private ensureTorchSprite(sprite: Phaser.GameObjects.Sprite, hasTorch: boolean, facing: Facing): void {
    let torchSprite = sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined;
    if (!torchSprite) {
      torchSprite = this.add.sprite(sprite.x, sprite.y, TORCH_HELD_TEXTURE_KEY).setDepth(1);
      sprite.setData('torchSprite', torchSprite);
    }
    torchSprite.setVisible(hasTorch);
    this.repositionShieldSprite(torchSprite, sprite, facing);
  }

  private destroyEntitySprite(sprite: Phaser.GameObjects.Sprite): void {
    (sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined)?.destroy();
    (sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    (sprite.getData('shieldSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    (sprite.getData('torchSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    sprite.destroy();
  }

  private tilePosition(row: number, col: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  // The kind actually rendered — a slime's mimicForm, if set, otherwise
  // its real race. Every texture/animation lookup for the LOCAL player
  // goes through this instead of `race` directly.
  private displayKind(): SpriteKind {
    return this.mimicForm ?? this.race;
  }

  private setIdle(): void {
    this.player.anims.stop();
    this.player.setTexture(textureKeyFor(this.displayKind()), idleFrameFor(this.displayKind(), this.facing));
  }

  // Moves an existing other-player/monster sprite to its newly-reported
  // tile: tweened with a walk animation if it actually changed (derived
  // from the delta, since map:state only reports positions, not
  // directions), or left alone if it's standing pat. Turns what would
  // otherwise be an instant teleport-jump into something that reads as a
  // step.
  private moveOrSnap(sprite: Phaser.GameObjects.Sprite, kind: SpriteKind, row: number, col: number): void {
    const prevRow = sprite.getData('row') as number;
    const prevCol = sprite.getData('col') as number;
    sprite.setData('row', row);
    sprite.setData('col', col);

    if (sprite.getData('isPunching')) return;
    if (prevRow === row && prevCol === col) return;

    const dRow = row - prevRow;
    const dCol = col - prevCol;
    const facing: FacingGroup = Math.abs(dRow) >= Math.abs(dCol) ? (dRow < 0 ? 'up' : 'down') : dCol < 0 ? 'left' : 'right';
    sprite.setData('facing', facing);
    const pos = this.tilePosition(row, col);

    sprite.play(walkAnimKey(kind, facing), true);
    this.tweens.add({
      targets: sprite,
      x: pos.x,
      y: pos.y,
      duration: REMOTE_STEP_TWEEN_MS,
      onComplete: () => {
        sprite.anims.stop();
        sprite.setTexture(textureKeyFor(kind), idleFrameFor(kind, facing));
      },
    });
  }

  // Sets the camera's world bounds to the new map's pixel footprint and
  // swaps its floor texture/door position. The canvas itself stays fixed
  // at the browser window's size (see Phaser.Scale.RESIZE in startGame) —
  // the camera follows the player and is clamped to whichever map's
  // bounds are set here, so a small map and a huge one both just work
  // without the canvas itself changing size.
  // A map smaller than the current viewport (the Labyrinth at typical
  // window sizes, say) has nowhere to scroll to — followed normally, the
  // camera would just pin it into a corner instead of centering it. Only
  // follow the player when the map is actually big enough in that axis to
  // need scrolling; otherwise stop following and center the camera on the
  // map itself. Re-applied on window resize too, since resizing the
  // browser can cross that threshold either way for the same map.
  private applyCameraBounds(pixelWidth: number, pixelHeight: number): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, pixelWidth, pixelHeight);
    const fitsWidth = pixelWidth <= cam.width;
    const fitsHeight = pixelHeight <= cam.height;
    if (fitsWidth && fitsHeight) {
      cam.stopFollow();
      cam.centerOn(pixelWidth / 2, pixelHeight / 2);
    } else {
      cam.startFollow(this.player, true, 1, 1);
    }
  }

  private renderMap(mapName: MapName): void {
    this.currentMap = mapName;
    const def = getMap(mapName);
    const pixelWidth = def.cols * TILE_SIZE;
    const pixelHeight = def.rows * TILE_SIZE;

    this.applyCameraBounds(pixelWidth, pixelHeight);

    // Recreated from scratch (rather than reusing setSize() on the
    // existing tile sprite) — on the very first map load, resizing an
    // existing TileSprite from its initial placeholder size didn't
    // reliably take effect (the floor stayed tiny, top-left corner only,
    // until a later map transition happened to fix it). Building a fresh
    // one at the correct size from the start sidesteps that entirely.
    this.floorTile?.destroy();
    this.floorTile = this.add
      .tileSprite(0, 0, pixelWidth, pixelHeight, floorTextureFor(mapName))
      .setOrigin(0, 0)
      .setDepth(-1);

    // One door sprite per exit — Great Plains alone now has three
    // (Labyrinth/Floro/Kortho), so a single reused sprite (the old
    // approach, from when every map had at most one exit) would only ever
    // show the first.
    for (const sprite of this.doorSprites) sprite.destroy();
    this.doorSprites = def.exits.map((exit) => {
      const pos = this.tilePosition(exit.row, exit.col);
      // Every reciprocal door pair lands you exactly on the tile that
      // triggers the return exit (see shared/maps.ts), so the player
      // stands ON a door sprite on every single transition. Without an
      // explicit depth, door sprites (recreated — and so re-inserted at
      // the top of the display list — on every renderMap call) rendered
      // OVER the player, hiding the sprite completely. Depth -0.5 keeps
      // them above the floor (-1) but below every character.
      return this.add.sprite(pos.x, pos.y, 'door').setDepth(-0.5);
    });

    // Other entities belong to whichever map we just left — clear them
    // out immediately rather than waiting for the next map:state.
    for (const sprite of this.otherPlayers.values()) this.destroyEntitySprite(sprite);
    this.otherPlayers.clear();
    for (const sprite of this.npcSprites.values()) this.destroyEntitySprite(sprite);
    this.npcSprites.clear();
    for (const sprite of this.monsterSprites.values()) this.destroyEntitySprite(sprite);
    this.monsterSprites.clear();
    for (const sprite of this.corpseSprites.values()) sprite.destroy();
    this.corpseSprites.clear();
    for (const sprite of this.vendorSprites.values()) sprite.destroy();
    this.vendorSprites.clear();
    for (const sprite of this.vendorFrontSprites.values()) sprite.destroy();
    this.vendorFrontSprites.clear();

    // Great-Plains-only, fixed positions from the shared/trees.ts seed —
    // the server blocks movement onto these same tiles (see
    // WorldManagerService/MonsterManagerService), so this list must stay
    // byte-for-byte identical between client and server.
    for (const sprite of this.treeSprites) sprite.destroy();
    this.treeSprites = [];
    if (mapName === 'Great Plains') {
      for (const { row, col } of treePositionsFor(mapName)) {
        const pos = this.tilePosition(row, col);
        const sprite = this.add.sprite(pos.x, pos.y, TREE_TEXTURE_KEY).setOrigin(0.5, 0.85).setDepth(-0.5);
        // A gentle sway tween (a whole crown swaying in a breeze) instead
        // of a multi-frame animation — the tree is a single static image
        // asset now (see assets/tree.svg), and a small back-and-forth
        // rotation reads the same way a sway spritesheet did. Randomized
        // start/duration per tree so they don't all sway in lockstep.
        this.tweens.add({
          targets: sprite,
          angle: { from: -2, to: 2 },
          duration: 3200 + Math.random() * 1600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.treeSprites.push(sprite);
      }
    }

    // Always-lit maps only (the Labyrinth) — purely decorative, giving
    // the visual reason it never goes dark (item 7). A gentle alpha
    // flicker per torch, each on its own randomized cycle so they don't
    // all pulse in lockstep.
    for (const sprite of this.wallTorchSprites) sprite.destroy();
    this.wallTorchSprites = [];
    for (const { row, col } of torchWallPositionsFor(mapName)) {
      const pos = this.tilePosition(row, col);
      const sprite = this.add.sprite(pos.x, pos.y, WALL_TORCH_TEXTURE_KEY).setOrigin(0.5, 0.9).setDepth(-0.5);
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.75, to: 1 },
        duration: 400 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
      });
      this.wallTorchSprites.push(sprite);
    }
  }

  private applySync(player: PlayerSnapshot): void {
    this.myUsername = player.username;
    this.race = player.race;
    this.mimicForm = player.mimicForm;
    this.row = player.row;
    this.col = player.col;
    myProfile = player;
    loadActionBarOnce(player.username);
    updateStatusBar();
    updateWorldLabel(player.map);
    refreshOpenModals();

    // 'sync' fires on every level-up, not just map transitions — calling
    // renderMap unconditionally used to wipe every other-player/NPC/
    // monster/corpse sprite on ANY sync, which briefly made autopilot see
    // zero monsters and think it had run out of targets. Only actually
    // tear down and rebuild the map when the map itself changed.
    if (!this.hasRenderedMap || player.map !== this.currentMap) {
      this.renderMap(player.map);
      this.hasRenderedMap = true;
    }
    const pos = this.tilePosition(player.row, player.col);
    this.player.setPosition(pos.x, pos.y);
    // A sync can land mid-punch or mid-move (e.g. a level-up granted by
    // the very punch that's still animating). setIdle() below calls
    // anims.stop(), which — unlike letting an animation finish on its own
    // — never fires its 'animationcomplete' callback, so isPunching would
    // otherwise be stranded true forever, permanently freezing update()'s
    // very first `if (this.isMoving || this.isPunching) return;` guard
    // (the "WASD stopped working" symptom).
    this.isMoving = false;
    this.isPunching = false;
    this.setIdle();
    this.updateOwnBars();
    this.updateOwnWeaponSprite(Boolean(player.equipment.weapon));
    this.updateOwnShieldSprite(player.equipment.shield === 'bone shield');
    this.applyRestPose(this.player, player.restState, CHAR_SCALE);
  }

  private applyMapState(state: MapStatePayload): void {
    // We don't know our own (server-canonical, exact-case) username until
    // the 'sync' event sets it — without this guard, a map:state that
    // somehow arrived first would fail to filter "us" out of the roster
    // and spawn a permanent, never-updated ghost duplicate of our own
    // sprite (always facing its default down/idle pose, since only real
    // *other* players get their facing driven by remote punches).
    if (!this.myUsername) return;
    // A map:state for whichever map we've already left/not yet entered
    // can arrive slightly out of order around a transition (the server
    // broadcasts to a room the instant this socket joins it, which can
    // race the move's own ack/renderMap on the client) — merging it in
    // would populate otherPlayers/npcSprites/monsterSprites/corpseSprites
    // with entries for the wrong map. Only apply a snapshot for the map
    // we're actually currently rendering.
    if (state.mapName !== this.currentMap) return;

    const seenPlayers = new Set<string>();
    for (const p of state.players) {
      if (p.username === this.myUsername) continue;
      seenPlayers.add(p.username);

      // A slime's mimicForm (if set) overrides its rendered appearance
      // entirely — see shared/skills.ts's MIMIC_SKILL/REVERT_SKILL —
      // while p.race stays the real, mechanical one underneath.
      const displayKind: SpriteKind = p.mimicForm ?? p.race;
      let sprite = this.otherPlayers.get(p.username);
      if (!sprite) {
        const pos = this.tilePosition(p.row, p.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(displayKind), idleFrameFor(displayKind, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', p.row);
        sprite.setData('col', p.col);
        this.otherPlayers.set(p.username, sprite);
      } else {
        this.moveOrSnap(sprite, displayKind, p.row, p.col);
      }
      // A mimic-form change while standing still (no move to trigger
      // moveOrSnap's own texture swap) needs its own immediate refresh.
      if (sprite.getData('displayKind') !== displayKind) {
        sprite.setData('displayKind', displayKind);
        if (!sprite.getData('isPunching')) {
          const facing = (sprite.getData('facing') as FacingGroup) ?? 'down';
          sprite.setTexture(textureKeyFor(displayKind), idleFrameFor(displayKind, facing));
        }
      }
      sprite.setData('race', p.race);
      sprite.setData('hasLight', p.hasLight);
      sprite.setData('label', p.username);
      sprite.setData('hp', p.hp);
      sprite.setData('maxHp', p.maxHp);
      sprite.setData('level', p.level);
      sprite.setData('equipment', p.equipment);
      this.ensureHpBar(sprite, p.hp, p.maxHp);
      this.ensureWeaponSprite(sprite, Boolean(p.equipment.weapon), (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, p.equipment.shield === 'bone shield', (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureTorchSprite(sprite, p.equipment.shield === TORCH_ITEM, (sprite.getData('facing') as Facing) ?? 'down');
      this.applyRestPose(sprite, p.restState, CHAR_SCALE);
      if (this.targetKind === 'player' && this.targetId === p.username) updateTargetPanel(p.username, p.level, p.hp, p.maxHp);
    }
    for (const [username, sprite] of this.otherPlayers) {
      if (!seenPlayers.has(username)) {
        this.destroyEntitySprite(sprite);
        this.otherPlayers.delete(username);
        if (this.targetKind === 'player' && this.targetId === username) this.clearTarget();
      }
    }

    for (const npc of state.npcs) {
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const pos = this.tilePosition(npc.row, npc.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(npc.race), idleFrameFor(npc.race, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', npc.row);
        sprite.setData('col', npc.col);
        this.npcSprites.set(npc.id, sprite);
      } else if (sprite.getData('row') !== npc.row || sprite.getData('col') !== npc.col) {
        // NPCs are normally static, but the training dummy now relocates
        // on "death" — that's a respawn teleport, not a walk, so snap
        // straight to the new tile rather than tweening a walk animation.
        sprite.setData('row', npc.row);
        sprite.setData('col', npc.col);
        const pos = this.tilePosition(npc.row, npc.col);
        sprite.setPosition(pos.x, pos.y);
      }
      sprite.setData('race', npc.race);
      sprite.setData('label', 'training dummy');
      sprite.setData('hp', npc.hp);
      sprite.setData('maxHp', npc.maxHp);
      sprite.setData('level', npc.level);
      this.ensureHpBar(sprite, npc.hp, npc.maxHp);
      if (this.targetKind === 'npc' && this.targetId === npc.id) updateTargetPanel('training dummy', npc.level, npc.hp, npc.maxHp);
    }

    const seenMonsters = new Set<string>();
    for (const m of state.monsters) {
      seenMonsters.add(m.id);

      let sprite = this.monsterSprites.get(m.id);
      if (!sprite) {
        const pos = this.tilePosition(m.row, m.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(m.kind), idleFrameFor(m.kind, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', m.row);
        sprite.setData('col', m.col);
        this.monsterSprites.set(m.id, sprite);
      } else {
        this.moveOrSnap(sprite, m.kind, m.row, m.col);
      }
      sprite.setData('kind', m.kind);
      sprite.setData('label', m.kind);
      sprite.setData('hp', m.hp);
      sprite.setData('maxHp', m.maxHp);
      sprite.setData('level', m.level);
      sprite.setData('carriedItems', m.carriedItems);
      this.ensureHpBar(sprite, m.hp, m.maxHp);
      const hasWeapon = m.carriedItems.some((item) => item.toLowerCase().includes('dagger'));
      const hasShield = m.carriedItems.some((item) => item.toLowerCase().includes('shield'));
      this.ensureWeaponSprite(sprite, hasWeapon, (sprite.getData('facing') as Facing) ?? 'down');
      this.ensureShieldSprite(sprite, hasShield, (sprite.getData('facing') as Facing) ?? 'down');
      if (this.targetKind === 'monster' && this.targetId === m.id) updateTargetPanel(m.kind, m.level, m.hp, m.maxHp);
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(id);
        if (this.targetKind === 'monster' && this.targetId === id) this.clearTarget();
      }
    }

    const seenCorpses = new Set<string>();
    for (const c of state.corpses) {
      seenCorpses.add(c.id);
      if (this.corpseSprites.has(c.id)) continue;

      const pos = this.tilePosition(c.row, c.col);
      const sprite = this.add
        .sprite(pos.x, pos.y, textureKeyFor(c.kind), bodyPartFrameKey(c.kind))
        .setScale(CORPSE_SCALE)
        .setDepth(-1)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (inputCaptured || !pointer.leftButtonDown()) return;
        // Every corpse (player, training dummy, or monster) opens the
        // same grab-all-or-pick-items loot modal — autopilot bypasses it
        // entirely below, grabbing straight away so automation doesn't
        // stall waiting on a modal.
        openCorpseModal(c.id, c.items, c.kind, c.killedBy);
      });
      this.corpseSprites.set(c.id, sprite);

      // Autopilot picks up after itself: a corpse it just created (from a
      // kill it just landed) is always within reach, since the punch
      // contact rule already requires standing adjacent to the target.
      if (this.autopilotActive && this.isWithinLootReach(c.row, c.col)) {
        this.lootCorpse(c.id, c.items, c.kind);
      }
    }
    for (const [id, sprite] of this.corpseSprites) {
      if (!seenCorpses.has(id)) {
        sprite.destroy();
        this.corpseSprites.delete(id);
      }
    }

    // Vendors are static and permanent for the lifetime of the map (never
    // added/removed by anything the client does), so this only ever needs
    // to create each one once, the first time it shows up in a snapshot.
    for (const v of state.vendors) {
      if (this.vendorSprites.has(v.id)) continue;

      // The shopfront stall sits directly in front of (one tile south
      // of) the shopkeeper, who stands behind it — decorative only, not
      // interactive/collidable.
      const frontPos = this.tilePosition(v.row + 1, v.col);
      const frontSprite = this.add.sprite(frontPos.x, frontPos.y, 'shopfront').setDepth(-0.5);
      this.vendorFrontSprites.set(v.id, frontSprite);

      const pos = this.tilePosition(v.row, v.col);
      const sprite = this.add
        .sprite(pos.x, pos.y, textureKeyFor('shopkeeper'), idleFrameFor('shopkeeper', 'down'))
        .setScale(CHAR_SCALE)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (inputCaptured || !pointer.leftButtonDown()) return;
        // Matches the server's own isClientWithinShopReach check — no
        // point opening a modal whose Buy button would just fail anyway,
        // and the message is clearer about why nothing happened.
        if (!isWithinRadius(this.row, this.col, v.row, v.col, SHOP_REACH_TILES)) {
          logCombatMessage("You're too far away to reach the shop.");
          return;
        }
        openShopModal(v);
      });
      this.vendorSprites.set(v.id, sprite);
    }
  }

  // True either because the player can see everywhere themselves
  // (infravision — strictly better than a torch, which only lights a
  // small radius, see hasLocalLight below) or because the map itself is
  // always lit regardless of who's standing in it (item 7: the
  // torch-lined Labyrinth). Matches shared/lighting.ts's hasFullVision
  // for the infravision half of this.
  private hasFullVision(): boolean {
    if (isAlwaysLit(this.currentMap)) return true;
    return myProfile ? myProfile.skills[INFRAVISION_SKILL] !== undefined : false;
  }

  // True if the local player has a LOCAL-radius-only light source — their
  // own carried torch, a nearby ally's carried torch (a torch is the only
  // thing that actually emits light others can share in — see
  // shared/lighting.ts's emitsLight), or standing near a static fixture.
  private hasLocalLight(): boolean {
    if (!myProfile) return false;
    if (myProfile.equipment.shield === TORCH_ITEM) return true;
    if (isNearStaticLight(this.currentMap, this.row, this.col)) return true;
    for (const sprite of this.otherPlayers.values()) {
      if (!sprite.getData('hasLight')) continue;
      const otherRow = sprite.getData('row') as number;
      const otherCol = sprite.getData('col') as number;
      if (isWithinLightRadius(this.row, this.col, otherRow, otherCol)) return true;
    }
    return false;
  }

  // Drives the #dark-fog-overlay DOM element every frame — cheap (just a
  // CSS background string), and simplest kept here rather than adding a
  // dedicated "did anything actually change" cache. Three tiers: full
  // vision (infravision) clears the whole screen; local light (torch/
  // ally/static fixture) clears only a small radius; no light at all
  // clears barely more than the player's own tile.
  private updateDarkFog(): void {
    if (!worldTimeKnown || !myProfile || !isDarkHour(currentWorldHour) || this.hasFullVision()) {
      hideDarkFog();
      return;
    }
    const cam = this.cameras.main;
    const screenX = (this.player.x - cam.scrollX) * cam.zoom;
    const screenY = (this.player.y - cam.scrollY) * cam.zoom;
    const radiusTiles = this.hasLocalLight() ? LIGHT_RADIUS_TILES : NO_LIGHT_RADIUS_TILES;
    const radiusPx = radiusTiles * TILE_SIZE * cam.zoom;
    showDarkFog(screenX, screenY, radiusPx);
  }

  private isWithinLootReach(row: number, col: number): boolean {
    return Math.abs(row - this.row) <= 1 && Math.abs(col - this.col) <= 1;
  }

  // `kind` is only passed by the autopilot call site (item 11) — used
  // purely to decide whether to also auto-sacrifice afterward, so a
  // manual (non-autopilot) loot never triggers it.
  private lootCorpse(corpseId: string, items: string[], kind?: string): void {
    this.network
      .loot(corpseId)
      .then((ack) => {
        if (!ack.ok) {
          if (ack.message) logCombatMessage(ack.message);
          return;
        }
        if (myProfile && ack.inventory) {
          myProfile = { ...myProfile, inventory: ack.inventory };
          refreshOpenModals();
        }
        if (items.length > 0) logCombatMessage(`You pick up the ${items.join(' and ')}.`);

        // Only a real monster corpse can be sacrificed at all (matches
        // updateSacrificeButton/the server's own handleSacrificeCorpse
        // check) — a player/training-dummy corpse is just left as-is.
        if (this.autopilotActive && kind !== undefined && (MONSTER_KINDS as readonly string[]).includes(kind)) {
          this.network
            .sacrificeCorpse(corpseId)
            .then((sacrificeAck) => {
              if (!sacrificeAck.ok) {
                if (sacrificeAck.message) logCombatMessage(sacrificeAck.message);
                return;
              }
              if (myProfile && sacrificeAck.gold !== undefined) {
                myProfile = { ...myProfile, gold: sacrificeAck.gold };
                updateStatusBar();
              }
              if (sacrificeAck.message) logCombatMessage(sacrificeAck.message);
            })
            .catch(() => {
              /* nothing to show */
            });
        }
      })
      .catch(() => {
        /* corpse likely already looted by someone else — nothing to show */
      });
  }

  private attemptMove(direction: Direction): void {
    this.facing = facingForDirection(direction);
    this.player.play(walkAnimKey(this.displayKind(), this.facing), true);
    this.isMoving = true;

    this.network
      .move(direction)
      .then((ack) => {
        if (!ack.ok) {
          this.isMoving = false;
          this.setIdle();
          if (ack.outOfMovement) {
            setLogTabVisible('combat', true);
            logCombatMessage(ack.message ?? "You're out of movement and need to rest.");
          }
          return;
        }

        this.row = ack.player.row;
        this.col = ack.player.col;
        // Every successful step costs movement points (item 16) — keep
        // the status bar's MV readout (and its own bar fill) in sync
        // rather than only patching `map` on a transition below.
        if (myProfile) myProfile = { ...myProfile, movement: ack.player.movement, maxMovement: ack.player.maxMovement };
        updateStatusBar();

        if (ack.player.map !== this.currentMap) {
          // A map transition is a load, not a walk — snap straight to the
          // new map rather than tweening across two different worlds.
          this.race = ack.player.race;
          this.mimicForm = ack.player.mimicForm;
          if (myProfile) myProfile = { ...myProfile, map: ack.player.map };
          this.renderMap(ack.player.map);
          updateWorldLabel(ack.player.map);
          const pos = this.tilePosition(ack.player.row, ack.player.col);
          this.player.setPosition(pos.x, pos.y);
          this.isMoving = false;
          this.setIdle();
          return;
        }

        const pos = this.tilePosition(ack.player.row, ack.player.col);
        this.tweens.add({
          targets: this.player,
          x: pos.x,
          y: pos.y,
          duration: MOVE_COOLDOWN_MS,
          onComplete: () => {
            this.isMoving = false;
            this.setIdle();
          },
        });
      })
      .catch(() => {
        this.isMoving = false;
        this.setIdle();
      });
  }

  // Right-click on another player, the training dummy, or a wild monster:
  // selects it as your target and engages combat with your default
  // attack (punch, or your equipped weapon's skill) — if it's already
  // adjacent that arms the next combat tick immediately (item 6); if not,
  // walks you toward it first and engages once in range (item 12).
  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isMoving || this.isPunching) return;
    const found = this.findTargetableAt(pointer.worldX, pointer.worldY);
    if (!found) return;

    this.setTarget(found.kind, found.id, found.sprite);
    const defaultSkill = myProfile?.equipment.weapon?.toLowerCase().includes('dagger') ? DAGGER_SKILL : PUNCH_SKILL;
    this.tryEngage(found.kind, found.id, defaultSkill);
  }

  // Left click anywhere a player/npc/monster sprite's bounds cover sets
  // it as the current target (see item 11) — deliberately not gated on
  // reach/adjacency the way punch is, since selecting a target you're
  // about to walk toward is normal play.
  private findTargetableAt(
    x: number,
    y: number
  ): { kind: 'player' | 'npc' | 'monster'; id: string; sprite: Phaser.GameObjects.Sprite } | null {
    for (const [username, sprite] of this.otherPlayers) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'player', id: username, sprite };
    }
    for (const [id, sprite] of this.npcSprites) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'npc', id, sprite };
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (sprite.getBounds().contains(x, y)) return { kind: 'monster', id, sprite };
    }
    return null;
  }

  private lastClickKey: string | null = null;
  private lastClickAt = 0;
  private static readonly DOUBLE_CLICK_MS = 350;

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    const found = this.findTargetableAt(pointer.worldX, pointer.worldY);
    if (!found) {
      // Clicking empty ground deselects whatever was targeted (item 10) —
      // but a click that actually landed on a corpse or vendor (handled
      // entirely by their own pointerdown listeners) isn't "empty ground",
      // just not a combat-targetable entity; leave the target alone.
      const hitOther = [...this.corpseSprites.values(), ...this.vendorSprites.values()].some((s) =>
        s.getBounds().contains(pointer.worldX, pointer.worldY)
      );
      if (!hitOther && this.targetKind) this.clearTarget();
      return;
    }
    this.setTarget(found.kind, found.id, found.sprite);

    const key = `${found.kind}:${found.id}`;
    const now = Date.now();
    if (this.lastClickKey === key && now - this.lastClickAt < WorldScene.DOUBLE_CLICK_MS) {
      this.lastClickKey = null;
      openTargetInfoModal(found.kind, found.id, found.sprite);
    } else {
      this.lastClickKey = key;
      this.lastClickAt = now;
    }
  }

  private setTarget(kind: 'player' | 'npc' | 'monster', id: string, sprite: Phaser.GameObjects.Sprite): void {
    this.targetKind = kind;
    this.targetId = id;
    const label = (sprite.getData('label') as string | undefined) ?? id;
    const level = (sprite.getData('level') as number | undefined) ?? 1;
    const hp = (sprite.getData('hp') as number | undefined) ?? 0;
    const maxHp = (sprite.getData('maxHp') as number | undefined) ?? 1;
    updateTargetPanel(label, level, hp, maxHp);
  }

  private clearTarget(): void {
    this.targetKind = null;
    this.targetId = null;
    hideTargetPanel();
  }

  // Read by the action bar (item 14) when a slotted skill is clicked —
  // "the currently selected target," if any.
  getTarget(): { kind: 'player' | 'npc' | 'monster'; id: string } | null {
    if (!this.targetKind || !this.targetId) return null;
    return { kind: this.targetKind, id: this.targetId };
  }

  // The action bar's click handler for a filled slot (item 14) — engages
  // the currently selected target with this exact skill. If it's out of
  // range, tryEngage starts walking toward it instead of just refusing
  // (item 12), same as a right-click does for the default attack.
  useTargetedSkill(skillName: string): void {
    if (!this.targetKind || !this.targetId) {
      logCombatMessage('Select a target first (left-click a player or monster).');
      return;
    }
    if (skillName === PUNCH_SKILL && myProfile?.equipment.weapon) {
      // Bare-handed only — wielding any weapon means there's a real
      // attack to throw instead (the dagger skill, or just the default
      // contact attack, both of which already apply the weapon's own
      // bonus damage server-side).
      logCombatMessage("You can't punch while wielding a weapon.");
      return;
    }
    if (this.isMoving || this.isPunching) return;

    this.tryEngage(this.targetKind, this.targetId, skillName);
  }

  private performPunch(direction: Direction): void {
    this.facing = facingForDirection(direction);
    const animKey = punchAnimKey(this.displayKind(), this.facing);

    this.isPunching = true;
    this.player.play(animKey, true);
    this.player.once(`animationcomplete-${animKey}`, () => {
      this.isPunching = false;
      this.setIdle();
    });

    this.network.punch(direction);
  }

  // Same swing animation as performPunch — no dedicated art per skill —
  // but dispatches the useSkill socket event naming exactly which learned
  // skill to queue (bone finger strike, glare) instead of the default
  // punch/dagger (see game.gateway.ts's handleUseSkill).
  private performSkillAttack(direction: Direction, skill: string): void {
    this.facing = facingForDirection(direction);
    const animKey = punchAnimKey(this.displayKind(), this.facing);

    this.isPunching = true;
    this.player.play(animKey, true);
    this.player.once(`animationcomplete-${animKey}`, () => {
      this.isPunching = false;
      this.setIdle();
    });

    this.network.useSkill(direction, skill);
  }

  private applyRemotePunch({ username, direction }: PunchPayload): void {
    const sprite = this.otherPlayers.get(username);
    if (!sprite) return;

    const race = sprite.getData('race') as Race;
    const facing = facingForDirection(direction);
    const animKey = punchAnimKey(race, facing);

    sprite.setData('isPunching', true);
    sprite.play(animKey, true);
    sprite.once(`animationcomplete-${animKey}`, () => {
      sprite.setData('isPunching', false);
      sprite.setTexture(textureKeyFor(race), idleFrameFor(race, 'down'));
    });
  }

  // The server resolves damage/exp/leveling and broadcasts the outcome —
  // this just reflects it: a combat-log line, and an immediate HP-bar/
  // status-bar update rather than waiting for the next map:state tick.
  private applyCombatEvent(event: CombatEventPayload): void {
    // Deselect a target the instant it dies (item 10) — covers monster/
    // npc/player kills alike, including cases (an NPC dummy relocating, a
    // killed player respawning elsewhere) where the entity doesn't
    // actually disappear from the next map:state, so the removal-based
    // cleanup in applyMapState would never have caught it.
    if (event.targetDied && this.targetKind === event.targetKind && this.targetId === event.target) {
      this.clearTarget();
    }

    // Only auto-switch tabs for a fight the player is actually in — not
    // for every combat line broadcast to the room from someone else's.
    const involvesMe = event.attacker === this.myUsername || (event.targetKind === 'player' && event.target === this.myUsername);
    if (involvesMe) noteCombatActivity();
    const logKind = event.targetDied ? 'death' : event.leveledUp ? 'level-up' : undefined;
    logCombatMessage(event.message, logKind);
    if (event.leveledUp && event.attacker === this.myUsername) {
      logCombatMessage(`${this.myUsername} reaches level ${event.attackerLevel}!`, 'level-up');
    }
    for (const growthMessage of event.growthMessages ?? []) {
      logCombatMessage(growthMessage, 'level-up');
    }

    if (event.attacker === this.myUsername) {
      this.applyOwnStats({ level: event.attackerLevel, exp: event.attackerExp, hp: event.attackerHp, maxHp: event.attackerMaxHp });
    }

    if (event.targetKind === 'player' && event.target === this.myUsername) {
      this.applyOwnStats({ hp: event.targetHp, maxHp: event.targetMaxHp });
      return; // if we died, a fresh 'sync' follows separately with our respawned position
    }

    if (event.targetKind === 'npc') {
      const sprite = this.npcSprites.get(event.target);
      if (sprite) this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
    } else if (event.targetKind === 'monster') {
      const sprite = this.monsterSprites.get(event.target);
      if (!sprite) return;
      if (event.targetDied) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(event.target);
      } else {
        this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
      }
    } else if (event.targetKind === 'player') {
      const sprite = this.otherPlayers.get(event.target);
      if (sprite) this.ensureHpBar(sprite, event.targetHp, event.targetMaxHp);
    }
  }

  private applyOwnStats(updates: Partial<PlayerSnapshot>): void {
    if (!myProfile) return;
    myProfile = { ...myProfile, ...updates };
    this.updateOwnBars();
    updateStatusBar();
    refreshOpenModals();
  }
}

function startGame(): void {
  // Guards against a double game.new instance (e.g. a double form submit)
  // creating two overlapping Phaser canvases on top of each other.
  if (gameInstance) return;

  authScreen.hidden = true;
  gameRoot.hidden = false;

  // RESIZE (rather than the old FIT) keeps the canvas tracking the
  // container's actual width AND height continuously — FIT preserved the
  // game's internal aspect ratio (square, from the 20x20 maps) inside a
  // landscape browser window, so it only ever filled height and
  // letterboxed the sides. The camera (see WorldScene.create) follows the
  // player and is clamped per-map, so an oversized viewport just shows
  // more of the map rather than stretching it.
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: true,
    backgroundColor: '#14181a',
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
  });
  gameInstance = game;

  // The socket connects from inside WorldScene.create() instead of here —
  // see its own comment for why (a startup race that used to sometimes
  // lose the very first 'sync').
  game.scene.add('world', WorldScene, true, { network });
}
