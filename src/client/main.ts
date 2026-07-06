import { NetworkManager } from './net/NetworkManager.js';
import { initAuthUI } from './ui/AuthUI.js';
import { initGameUI } from './ui/GameUI.js';
import { getElement } from './dom.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const network = new NetworkManager(SERVER_URL);

function showAuthScreen(message?: string): void {
  getElement('hud').style.display = 'none';
  getElement('login-overlay').style.display = 'flex';
  getElement('login-error').textContent = message || '';
}

function showGame(): void {
  getElement('login-overlay').style.display = 'none';
  getElement('hud').style.display = 'flex';
  getElement('command-input').focus();
}

initGameUI(network, {
  onReady: showGame,
  onLoggedOut: showAuthScreen,
});

initAuthUI(network, () => {
  // Socket is connecting; GameUI flips the screen once 'sync' arrives.
});
