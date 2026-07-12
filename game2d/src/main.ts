// Thin bootstrap only — every actual behavior lives in a focused module
// under src/ui/ (plain-DOM panels/modals) or src/game/ (the Phaser
// scene). Add new features to one of those, not here; this file's only
// job is wiring the auth screen to the Phaser game and importing every
// module that needs to register its own DOM listeners at load time.
import Phaser from 'phaser';
import { network } from './state.js';
import { WorldScene } from './game/WorldScene.js';
import { hideAuthScreen, initAuthScreen } from './ui/authScreen.js';
import { hideCharacterSelectScreen, showCharacterSelectScreen } from './ui/characterSelect.js';
import { initGlobalKeyboardShortcuts } from './ui/keyboard.js';
import { refreshCooldownOverlays } from './ui/skillMeta.js';
import { updateEatBrainsButton } from './ui/corpseModal.js';

// Modules whose only job at this point is registering DOM event
// listeners (button clicks, drag/drop, ...) — imported for that side
// effect, not for any export main.ts itself uses.
import './ui/charSheet.js';
import './ui/inventoryEquipment.js';
import './ui/skillsPanel.js';
import './ui/spellsPanel.js';
import './ui/mapModal.js';
import './ui/autopilotModal.js';

const gameRoot = document.getElementById('game-root') as HTMLDivElement;

initGlobalKeyboardShortcuts();

setInterval(() => {
  refreshCooldownOverlays();
  updateEatBrainsButton();
}, 250);

let gameInstance: Phaser.Game | null = null;

function startGame(): void {
  // Guards against a double game.new instance (e.g. a double form submit)
  // creating two overlapping Phaser canvases on top of each other.
  if (gameInstance) return;

  hideAuthScreen();
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

// Account auth (login/register) and character selection are two separate
// steps (item 1) — succeeding at the first shows the character-select
// screen; picking (or creating) a character there is what actually
// starts the game.
initAuthScreen(() => {
  hideAuthScreen();
  showCharacterSelectScreen(() => {
    hideCharacterSelectScreen();
    startGame();
  });
});
