import Phaser from 'phaser';
import { NetworkManager } from './net.js';
import { createGrassTexture, TILE_SIZE } from './grassTexture.js';
import { createStoneTexture } from './stoneTexture.js';
import { createConcreteTexture } from './concreteTexture.js';
import { createDoorTexture } from './doorSprite.js';
import { createTreeSpritesheet, createTreeSwayAnim, TREE_TEXTURE_KEY, TREE_SWAY_ANIM_KEY } from './treeSprite.js';
import { createDaggerTexture, DAGGER_TEXTURE_KEY } from './daggerSprite.js';
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
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../shared/equipment.js';
import { STARTING_SKILLS, HOBGOBLIN_EVOLUTION_SKILLS, RESISTANCE_SKILLS } from '../shared/skills.js';
import { RACES, MAP_NAMES } from '../shared/constants.js';
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
} from '../shared/types.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';
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
const worldLabel = document.getElementById('world-label') as HTMLDivElement;
const sleepOverlay = document.getElementById('sleep-overlay') as HTMLDivElement;
const daynightOverlay = document.getElementById('daynight-overlay') as HTMLDivElement;

function updateWorldLabel(mapName: MapName): void {
  worldLabel.textContent = mapName;
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
function updateDaynightOverlay(hour: number): void {
  const darkness = ((1 - Math.cos(((hour - 12) / 24) * Math.PI * 2)) / 2) * MAX_NIGHT_OPACITY;
  daynightOverlay.style.background = `rgba(5, 5, 20, ${darkness.toFixed(3)})`;
}

const logPanel = document.getElementById('log-panel') as HTMLDivElement;
const logToggle = document.getElementById('log-toggle') as HTMLButtonElement;
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

function switchLogTab(tab: 'combat' | 'chat'): void {
  logTabCombatBtn.classList.toggle('active', tab === 'combat');
  logTabChatBtn.classList.toggle('active', tab === 'chat');
  combatLogEl.hidden = tab !== 'combat';
  chatLogEl.hidden = tab !== 'chat';
}

// Auto-switches to the Combat tab exactly once at the START of a fight
// (if the player wasn't already looking at it) — not on every single
// exchange, and not forcing them back if they deliberately switch to
// Chat mid-fight. A "fight" is considered over (so the NEXT punch counts
// as a new start) after a few seconds of no combat activity.
const COMBAT_SESSION_IDLE_MS = 8000;
let combatSessionActive = false;
let combatSessionTimer: ReturnType<typeof setTimeout> | null = null;

function noteCombatActivity(): void {
  if (!combatSessionActive) {
    combatSessionActive = true;
    if (!logTabCombatBtn.classList.contains('active')) switchLogTab('combat');
  }
  if (combatSessionTimer) clearTimeout(combatSessionTimer);
  combatSessionTimer = setTimeout(() => {
    combatSessionActive = false;
  }, COMBAT_SESSION_IDLE_MS);
}

logTabCombatBtn.addEventListener('click', () => switchLogTab('combat'));
logTabChatBtn.addEventListener('click', () => switchLogTab('chat'));

// Pressing Enter anywhere (outside a modal/another input) reveals and
// focuses the chat box — matching the text game's own "press Enter to
// chat" convention. Typing in it doesn't fight Phaser's global keyboard
// capture for the same reason the autopilot prompt doesn't (see
// setKeyCaptureEnabled) — focus/blur toggle it directly since the chat
// box isn't one of the ALL_MODALS.
let chatInputFocused = false;
function openChatInput(): void {
  chatInput.hidden = false;
  switchLogTab('chat');
  chatInput.focus();
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
const autopilotModal = document.getElementById('autopilot-modal') as HTMLDivElement;
const autopilotInput = document.getElementById('autopilot-input') as HTMLInputElement;
const autopilotStatusEl = document.getElementById('autopilot-status') as HTMLDivElement;

const ALL_MODALS = [charSheetModal, inventoryModal, skillsModal, equipmentModal, mapModal, corpseModal, autopilotModal];

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
  updateSleepOverlay();
}

function appendStatRow(container: HTMLDivElement, label: string, value: string | number): void {
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-value';
  valueEl.textContent = String(value);
  container.appendChild(labelEl);
  container.appendChild(valueEl);
}

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
  for (const [label, value] of rows) appendStatRow(charSheetBody, label, value);
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

function renderSkills(): void {
  if (!myProfile) return;
  skillsBody.innerHTML = '';
  for (const [skillName, percent] of Object.entries(myProfile.skills)) {
    appendStatRow(skillsBody, skillName, `${percent}%`);
  }
  if (showAllSkills) {
    for (const skillName of acquirableSkillPool()) {
      if (myProfile.skills[skillName] !== undefined) continue;
      appendStatRow(skillsBody, skillName, '(not yet acquired)');
      skillsBody.lastElementChild?.classList.add('not-acquired');
    }
  }
}

skillsShowAllToggle.addEventListener('click', () => {
  showAllSkills = !showAllSkills;
  skillsShowAllToggle.classList.toggle('active', showAllSkills);
  renderSkills();
});

function renderEquipment(): void {
  if (!myProfile) return;
  equipmentBody.innerHTML = '';
  for (const slot of EQUIPMENT_SLOTS) {
    appendStatRow(equipmentBody, EQUIPMENT_SLOT_LABELS[slot], myProfile.equipment[slot] ?? '(none)');
  }
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
    li.title = 'Click to use, right-click to consume';
    li.addEventListener('click', () => useInventoryItem(indices[0]));
    // The browser's own right-click context menu is never useful here —
    // captured and replaced with a forced consume (see
    // game.gateway.ts's consumeItem), so an otherwise-equippable item
    // (a bone dagger, say) can be eaten for its exp instead of worn.
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      consumeInventoryItem(indices[0]);
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
    activeScene?.refreshWeaponSprite();
  }
  logCombatMessage(ack.action === 'equipped' ? 'You equip it.' : 'You consume it.');
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

// ---------- Player (and training-dummy) corpse loot modal ----------
// Monster corpses stay grab-everything-on-click (see WorldScene.lootCorpse)
// — this modal is only for player-kind corpses (see the RACES check at the
// corpse sprite's pointerdown handler), where the user asked for a choice
// between "Grab all" and picking items one at a time.

let currentCorpseId: string | null = null;
let currentCorpseItems: string[] = [];

function renderCorpseModal(): void {
  corpseItemList.innerHTML = '';
  if (currentCorpseItems.length === 0) {
    hideModal(corpseModal);
    updateInputCaptured();
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

function openCorpseModal(corpseId: string, items: string[], kind: string): void {
  closeAllModals();
  currentCorpseId = corpseId;
  currentCorpseItems = [...items];
  corpseModalTitle.textContent = `${kind} corpse`;
  corpseModal.hidden = false;
  updateInputCaptured();
  renderCorpseModal();
}

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
      if (myProfile && ack.inventory) {
        myProfile = { ...myProfile, inventory: ack.inventory };
        refreshOpenModals();
      }
      logCombatMessage(`You pick up the ${currentCorpseItems.join(' and ')}.`);
      hideModal(corpseModal);
      updateInputCaptured();
    })
    .catch(() => {
      /* nothing to show */
    });
});

function refreshOpenModals(): void {
  if (!charSheetModal.hidden) renderCharSheet();
  if (!inventoryModal.hidden) renderInventory();
  if (!skillsModal.hidden) renderSkills();
  if (!equipmentModal.hidden) renderEquipment();
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

function directionForFacing(facing: Facing): Direction {
  if (facing === 'up') return 'north';
  if (facing === 'down') return 'south';
  return facing === 'left' ? 'west' : 'east';
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
  private floorTile!: Phaser.GameObjects.TileSprite;
  private doorSprites: Phaser.GameObjects.Sprite[] = [];
  private race: Race = 'goblin';
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
  // Great-Plains-only background dressing — server-enforced collision
  // (see shared/trees.ts), but no per-row depth sorting against
  // characters (always drawn behind them; see renderMap).
  private treeSprites: Phaser.GameObjects.Sprite[] = [];

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
    createGrassTexture(this, 'grass');
    createStoneTexture(this, 'stone');
    createConcreteTexture(this, 'concrete');
    createDoorTexture(this, 'door');
    createTreeSpritesheet(this);
    createDaggerTexture(this);
    preloadCharacterSprites(this);
  }

  create(): void {
    createCharacterAnims(this);
    defineBodyPartFrames(this);
    createTreeSwayAnim(this);

    this.player = this.add.sprite(0, 0, textureKeyFor('goblin'), idleFrameFor('goblin', 'down')).setScale(CHAR_SCALE);
    this.playerHpBar = this.add.graphics();
    this.playerManaBar = this.add.graphics();
    this.playerMovementBar = this.add.graphics();
    this.playerWeaponSprite = this.add.sprite(0, 0, DAGGER_TEXTURE_KEY).setVisible(false).setDepth(1);

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
    this.network.addEventListener('worldTime', ((e: CustomEvent<WorldTimePayload>) => updateDaynightOverlay(e.detail.hour)) as EventListener);
    this.network.addEventListener('kicked', ((e: CustomEvent<KickedPayload>) => {
      alert(e.detail.message);
      window.location.reload();
    }) as EventListener);

    activeScene = this;
  }

  update(): void {
    this.repositionHpBars();

    if (this.isMoving || this.isPunching) return;

    if (this.autopilotActive) {
      if (this.manualMoveKeyDown()) {
        this.stopAutopilot('Autopilot stopped (manual movement).');
      } else {
        this.runAutopilotTick();
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

  // Called after an equip/unequip so the held-weapon overlay updates
  // immediately rather than waiting for the next sync/map:state.
  refreshWeaponSprite(): void {
    if (!myProfile) return;
    this.updateOwnWeaponSprite(Boolean(myProfile.equipment.weapon));
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

  private repositionHpBars(): void {
    this.playerHpBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y);
    this.playerManaBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y + HP_BAR_HEIGHT + BAR_STACK_GAP);
    this.playerMovementBar.setPosition(this.player.x, this.player.y + HP_BAR_OFFSET_Y + (HP_BAR_HEIGHT + BAR_STACK_GAP) * 2);
    this.repositionWeaponSprite(this.playerWeaponSprite, this.player, this.facing);
    for (const sprite of this.otherPlayers.values()) this.repositionBarFor(sprite);
    for (const sprite of this.npcSprites.values()) this.repositionBarFor(sprite);
    for (const sprite of this.monsterSprites.values()) this.repositionBarFor(sprite);
  }

  private repositionBarFor(sprite: Phaser.GameObjects.Sprite): void {
    const bar = sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined;
    bar?.setPosition(sprite.x, sprite.y + HP_BAR_OFFSET_Y);
    const weaponSprite = sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined;
    if (weaponSprite) this.repositionWeaponSprite(weaponSprite, sprite, (sprite.getData('facing') as Facing) ?? 'down');
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

  private destroyEntitySprite(sprite: Phaser.GameObjects.Sprite): void {
    (sprite.getData('hpBar') as Phaser.GameObjects.Graphics | undefined)?.destroy();
    (sprite.getData('weaponSprite') as Phaser.GameObjects.Sprite | undefined)?.destroy();
    sprite.destroy();
  }

  private tilePosition(row: number, col: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  private setIdle(): void {
    this.player.anims.stop();
    this.player.setTexture(textureKeyFor(this.race), idleFrameFor(this.race, this.facing));
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

    // Great-Plains-only, fixed positions from the shared/trees.ts seed —
    // the server blocks movement onto these same tiles (see
    // WorldManagerService/MonsterManagerService), so this list must stay
    // byte-for-byte identical between client and server.
    for (const sprite of this.treeSprites) sprite.destroy();
    this.treeSprites = [];
    if (mapName === 'Great Plains') {
      for (const { row, col } of treePositionsFor(mapName)) {
        const pos = this.tilePosition(row, col);
        const sprite = this.add.sprite(pos.x, pos.y, TREE_TEXTURE_KEY, 0).setOrigin(0.5, 0.85).setDepth(-0.5);
        sprite.play(TREE_SWAY_ANIM_KEY);
        this.treeSprites.push(sprite);
      }
    }
  }

  private applySync(player: PlayerSnapshot): void {
    this.myUsername = player.username;
    this.race = player.race;
    this.row = player.row;
    this.col = player.col;
    myProfile = player;
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

      let sprite = this.otherPlayers.get(p.username);
      if (!sprite) {
        const pos = this.tilePosition(p.row, p.col);
        sprite = this.add.sprite(pos.x, pos.y, textureKeyFor(p.race), idleFrameFor(p.race, 'down')).setScale(CHAR_SCALE);
        sprite.setData('row', p.row);
        sprite.setData('col', p.col);
        this.otherPlayers.set(p.username, sprite);
      } else {
        this.moveOrSnap(sprite, p.race, p.row, p.col);
      }
      sprite.setData('race', p.race);
      this.ensureHpBar(sprite, p.hp, p.maxHp);
      this.ensureWeaponSprite(sprite, Boolean(p.equipment.weapon), (sprite.getData('facing') as Facing) ?? 'down');
      this.applyRestPose(sprite, p.restState, CHAR_SCALE);
    }
    for (const [username, sprite] of this.otherPlayers) {
      if (!seenPlayers.has(username)) {
        this.destroyEntitySprite(sprite);
        this.otherPlayers.delete(username);
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
      this.ensureHpBar(sprite, npc.hp, npc.maxHp);
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
      this.ensureHpBar(sprite, m.hp, m.maxHp);
      const hasWeapon = m.carriedItems.some((item) => item.toLowerCase().includes('dagger'));
      this.ensureWeaponSprite(sprite, hasWeapon, (sprite.getData('facing') as Facing) ?? 'down');
    }
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        this.destroyEntitySprite(sprite);
        this.monsterSprites.delete(id);
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
        // Player (and training-dummy) corpses open the loot modal for a
        // grab-all-or-pick-items choice; monster corpses stay a simple
        // grab-everything click, same as before.
        if ((RACES as readonly string[]).includes(c.kind)) {
          openCorpseModal(c.id, c.items, c.kind);
        } else {
          this.lootCorpse(c.id, c.items);
        }
      });
      this.corpseSprites.set(c.id, sprite);

      // Autopilot picks up after itself: a corpse it just created (from a
      // kill it just landed) is always within reach, since the punch
      // contact rule already requires standing adjacent to the target.
      if (this.autopilotActive && this.isWithinLootReach(c.row, c.col)) {
        this.lootCorpse(c.id, c.items);
      }
    }
    for (const [id, sprite] of this.corpseSprites) {
      if (!seenCorpses.has(id)) {
        sprite.destroy();
        this.corpseSprites.delete(id);
      }
    }
  }

  private isWithinLootReach(row: number, col: number): boolean {
    return Math.abs(row - this.row) <= 1 && Math.abs(col - this.col) <= 1;
  }

  private lootCorpse(corpseId: string, items: string[]): void {
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
        logCombatMessage(`You pick up the ${items.join(' and ')}.`);
      })
      .catch(() => {
        /* corpse likely already looted by someone else — nothing to show */
      });
  }

  private attemptMove(direction: Direction): void {
    this.facing = facingForDirection(direction);
    this.player.play(walkAnimKey(this.race, this.facing), true);
    this.isMoving = true;

    this.network
      .move(direction)
      .then((ack) => {
        if (!ack.ok) {
          this.isMoving = false;
          this.setIdle();
          return;
        }

        this.row = ack.player.row;
        this.col = ack.player.col;

        if (ack.player.map !== this.currentMap) {
          // A map transition is a load, not a walk — snap straight to the
          // new map rather than tweening across two different worlds.
          this.race = ack.player.race;
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
  // throw a punch in whichever direction the player is CURRENTLY facing
  // (from the last WASD/arrow press) — the click just has to land on a
  // target, it doesn't re-aim the punch toward it. Damage only actually
  // applies server-side if that target is standing exactly one tile
  // ahead in the punched direction (see game.gateway.ts's handlePunch) —
  // right-clicking a target further away still throws the punch (and
  // still looks the same locally) but simply won't connect.
  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isMoving || this.isPunching) return;
    if (!this.findEntityAt(pointer.worldX, pointer.worldY)) return;

    this.performPunch(directionForFacing(this.facing));
  }

  private findEntityAt(x: number, y: number): boolean {
    for (const sprite of [...this.otherPlayers.values(), ...this.npcSprites.values(), ...this.monsterSprites.values()]) {
      if (sprite.getBounds().contains(x, y)) return true;
    }
    return false;
  }

  private performPunch(direction: Direction): void {
    this.facing = facingForDirection(direction);
    const animKey = punchAnimKey(this.race, this.facing);

    this.isPunching = true;
    this.player.play(animKey, true);
    this.player.once(`animationcomplete-${animKey}`, () => {
      this.isPunching = false;
      this.setIdle();
    });

    this.network.punch(direction);
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

  game.scene.add('world', WorldScene, true, { network });

  network.connectSocket();
}
