import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene.js';
import { NetworkManager } from './net/NetworkManager.js';
import { initLoginUI } from './ui/LoginUI.js';
import { initChatUI } from './ui/ChatUI.js';
import { initLeaderboardUI } from './ui/LeaderboardUI.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const network = new NetworkManager(SERVER_URL);

function startGame(self, worldSize) {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0d1117',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [GameScene],
  });

  game.registry.set('network', network);
  game.registry.set('self', self);
  game.registry.set('worldSize', worldSize);
}

initLoginUI(network, startGame);
initChatUI(network);
initLeaderboardUI(network);
