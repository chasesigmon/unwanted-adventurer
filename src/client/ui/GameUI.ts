import type { NetworkManager, DisconnectedDetail } from '../net/NetworkManager.js';
import type { SyncPayload, KickedPayload } from '../../server/sockets/types.js';
import type { PlayerSnapshot, MinimapCell } from '../../shared/types.js';
import { getElement } from '../dom.js';

export interface GameUICallbacks {
  onReady: () => void;
  onLoggedOut: (message?: string) => void;
}

// Pure rendering + input capture. Position/minimap only ever change in
// response to a 'sync' event (on connect and reconnect) or a command ack —
// both always come from the server, never decided locally.
export function initGameUI(network: NetworkManager, { onReady, onLoggedOut }: GameUICallbacks): void {
  const positionEl = getElement('position-readout');
  const actionLogEl = getElement('action-log');
  const minimapEl = getElement('minimap');
  const commandInput = getElement<HTMLInputElement>('command-input');

  let hasSyncedOnce = false;

  function renderPosition(player: PlayerSnapshot): void {
    positionEl.textContent = `${player.map}: (${player.row}, ${player.col})`;
  }

  function renderMinimap(cells: MinimapCell[]): void {
    minimapEl.innerHTML = '';
    for (const cell of cells) {
      const span = document.createElement('span');
      span.className = 'minimap-cell';
      if (cell.self) span.classList.add('is-self');
      else if (cell.exit) span.classList.add('is-exit');
      span.textContent = cell.self ? '@' : cell.exit ? '*' : cell.inBounds ? '.' : '#';
      minimapEl.appendChild(span);
    }
  }

  function renderAction(message: string): void {
    actionLogEl.textContent = message;
  }

  network.addEventListener('sync', (e) => {
    const { player, minimap } = (e as CustomEvent<SyncPayload>).detail;
    renderPosition(player);
    renderMinimap(minimap);
    if (!hasSyncedOnce) {
      hasSyncedOnce = true;
      renderAction(`${player.username} entered ${player.map}.`);
      onReady();
    } else {
      renderAction('Reconnected — position resynced with the server.');
    }
  });

  network.addEventListener('kicked', (e) => {
    const { message } = (e as CustomEvent<KickedPayload>).detail;
    network.disconnectAndReset();
    hasSyncedOnce = false;
    onLoggedOut(message);
  });

  network.addEventListener('disconnected', (e) => {
    const { reason } = (e as CustomEvent<DisconnectedDetail>).detail;
    // A server- or client-initiated disconnect (logout, or kicked by a
    // newer login) won't auto-reconnect and the token is no longer good —
    // go back to login. Anything else is a transient network drop that
    // Socket.io will retry on its own.
    if (reason === 'io server disconnect' || reason === 'io client disconnect') {
      network.disconnectAndReset();
      hasSyncedOnce = false;
      onLoggedOut();
    } else {
      renderAction('Connection lost. Reconnecting…');
    }
  });

  network.addEventListener('reconnect_failed', () => {
    network.disconnectAndReset();
    hasSyncedOnce = false;
    onLoggedOut('Could not reconnect. Please log in again.');
  });

  commandInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = commandInput.value.trim();
    if (!text) return;
    commandInput.value = '';

    try {
      const res = await network.sendCommand(text);
      if (res.loggedOut) {
        network.disconnectAndReset();
        hasSyncedOnce = false;
        onLoggedOut(res.message);
        return;
      }
      if (res.player) renderPosition(res.player);
      if (res.minimap) renderMinimap(res.minimap);
      renderAction(res.message);
    } catch (err) {
      renderAction(err instanceof Error ? err.message : String(err));
    }
  });
}
