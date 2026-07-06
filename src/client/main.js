import { NetworkManager } from './net/NetworkManager.js';
import { initAuthUI } from './ui/AuthUI.js';
import { initGameUI } from './ui/GameUI.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const network = new NetworkManager(SERVER_URL);

function showAuthScreen(message) {
  document.getElementById('hud').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-error').textContent = message || '';
}

function showGame() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('command-input').focus();
}

initGameUI(network, {
  onReady: showGame,
  onLoggedOut: showAuthScreen,
});

initAuthUI(network, () => {
  // Socket is connecting; GameUI flips the screen once 'sync' arrives.
});
