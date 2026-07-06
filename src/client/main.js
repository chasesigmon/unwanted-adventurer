import { NetworkManager } from './net/NetworkManager.js';
import { initLoginUI } from './ui/LoginUI.js';
import { initGameUI } from './ui/GameUI.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const network = new NetworkManager(SERVER_URL);

function startGame(self, minimap) {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  initGameUI(network, self, minimap);
}

initLoginUI(network, startGame);
