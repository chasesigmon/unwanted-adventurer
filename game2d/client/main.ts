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
import './ui/questLog.js';
import './ui/autopilotModal.js';
import './ui/affectsPanel.js';
import './ui/helpModal.js';

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
  // Bug fix: #game-container is now inset from the full window by the HUD
  // margins (see style.css's --hud-top-margin/--hud-bottom-margin) so the
  // canvas itself never extends under the status bar/log panel — sized
  // from the CONTAINER's own actual box here (not window.innerWidth/
  // innerHeight) so the very first frame already matches; RESIZE mode
  // keeps tracking it on every subsequent browser resize.
  const gameContainer = document.getElementById('game-container') as HTMLDivElement;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: gameContainer.clientWidth,
    height: gameContainer.clientHeight,
    pixelArt: true,
    backgroundColor: '#14181a',
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    // A later follow-up ask: cap the render/update loop at 30fps instead
    // of the browser's own refresh rate (usually 60+). Safe to do outright
    // here — every animated movement in this game (player/monster/NPC
    // step tweens, camera follow) is driven by Phaser's own tween/camera
    // systems, which are time-based (ms elapsed), not frame-count-based,
    // so nothing moves faster or slower just because fewer frames render
    // per second; this only reduces how often the GPU actually redraws.
    fps: {
      target: 30,
      // Rely on requestAnimationFrame (throttled by Phaser itself to the
      // target above) rather than setTimeout — smoother and still capped.
      forceSetTimeOut: false,
    },
    // A later follow-up bug fix: "select the treasure chest... click
    // unlock... automatically reverts my selection to the Utility door" —
    // Phaser's MouseManager defaults to ALSO listening for mousedown on
    // `window` (not just the canvas), and dispatches a real pointerdown
    // (using the click's own screen position) for ANY click whose target
    // isn't the canvas — including a DOM button/overlay (the action bar,
    // corner buttons, dock controls) sitting on top of it. Whatever world
    // sprite happens to render underneath that DOM element then silently
    // receives its own pointerdown first, stealing the current selection,
    // before the DOM element's own click handler ever runs. Disabling
    // window-level input listening confines Phaser's pointer events to
    // actual clicks ON the canvas, the same as any other DOM element.
    input: {
      windowEvents: false,
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
function onCharacterChosen(): void {
  hideCharacterSelectScreen();
  startGame();
}

// A later follow-up ask: "the logout from the top right of the game
// [should] take you back out to character selection... login again or
// register [only after] the account/character selection [logout]." The
// top-right logout (see statusBar.ts) reloads the page rather than
// tearing down the live Phaser scene in place (WorldScene registers a
// pile of its own `network` event listeners with nothing that currently
// removes them again, so a second scene instance without a real reload
// would double them up) — restoreAccountSession picks the account
// session back up from localStorage so that reload lands straight on
// character select instead of making the player log in again.
void network.restoreAccountSession().then((restored) => {
  if (restored) {
    hideAuthScreen();
    showCharacterSelectScreen(onCharacterChosen);
    return;
  }
  initAuthScreen(() => {
    hideAuthScreen();
    showCharacterSelectScreen(onCharacterChosen);
  });
});
