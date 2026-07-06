import { io } from 'socket.io-client';

// Owns auth (HTTP) and the game socket. The JWT is kept in memory only
// (never localStorage) — it doesn't need to survive a page reload, only a
// temporary network drop, and Socket.io's own reconnection logic re-sends
// whatever `auth` was set at connect time on every reconnection attempt.
export class NetworkManager extends EventTarget {
  constructor(serverUrl) {
    super();
    this.serverUrl = serverUrl;
    this.socket = null;
    this.token = null;
  }

  async _authFetch(path, body) {
    const res = await fetch(`${this.serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Request failed.');
    }
    return data;
  }

  async register(username, password) {
    const { token } = await this._authFetch('/auth/register', { username, password });
    this.token = token;
  }

  async login(username, password) {
    const { token } = await this._authFetch('/auth/login', { username, password });
    this.token = token;
  }

  connectSocket() {
    this.socket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('sync', (data) => this.dispatchEvent(new CustomEvent('sync', { detail: data })));
    this.socket.on('session:kicked', (data) => this.dispatchEvent(new CustomEvent('kicked', { detail: data })));
    this.socket.on('disconnect', (reason) =>
      this.dispatchEvent(new CustomEvent('disconnected', { detail: { reason } }))
    );
    this.socket.on('connect_error', (err) =>
      this.dispatchEvent(new CustomEvent('connect_error', { detail: { message: err.message } }))
    );
    // Reconnection lifecycle events live on the Manager, not the Socket.
    this.socket.io.on('reconnect_attempt', (attempt) =>
      this.dispatchEvent(new CustomEvent('reconnecting', { detail: { attempt } }))
    );
    this.socket.io.on('reconnect', () => this.dispatchEvent(new CustomEvent('reconnected', {})));
    this.socket.io.on('reconnect_failed', () => this.dispatchEvent(new CustomEvent('reconnect_failed', {})));
  }

  disconnectAndReset() {
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
  }

  sendCommand(text) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('command', text, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }
}
