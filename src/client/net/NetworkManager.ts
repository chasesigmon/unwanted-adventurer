import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CommandAck,
  SyncPayload,
  KickedPayload,
  CombatUpdatePayload,
} from '../../server/game-gateway/types.js';

// Note the reversed type-parameter order versus the server's Socket<>: from
// the client's perspective, "listen" events are what the server emits
// (ServerToClientEvents) and "emit" events are what the client sends
// (ClientToServerEvents).
type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type AuthResponse = { ok: true; token: string } | { ok: false; error: string };

export interface DisconnectedDetail {
  reason: string;
}

export interface ConnectErrorDetail {
  message: string;
}

export interface ReconnectingDetail {
  attempt: number;
}

// Owns auth (HTTP) and the game socket. The JWT is kept in memory only
// (never localStorage) — it doesn't need to survive a page reload, only a
// temporary network drop, and Socket.io's own reconnection logic re-sends
// whatever `auth` was set at connect time on every reconnection attempt.
export class NetworkManager extends EventTarget {
  private serverUrl: string;
  socket: GameClientSocket | null = null;
  private token: string | null = null;

  constructor(serverUrl: string) {
    super();
    this.serverUrl = serverUrl;
  }

  private async authFetch(path: string, body: unknown): Promise<{ token: string }> {
    const res = await fetch(`${this.serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as AuthResponse | null;

    if (!res.ok || !data || !data.ok) {
      const message = data && !data.ok ? data.error : 'Request failed.';
      throw new Error(message);
    }

    return { token: data.token };
  }

  async register(username: string, password: string): Promise<void> {
    const { token } = await this.authFetch('/auth/register', { username, password });
    this.token = token;
  }

  async login(username: string, password: string): Promise<void> {
    const { token } = await this.authFetch('/auth/login', { username, password });
    this.token = token;
  }

  connectSocket(): void {
    const socket: GameClientSocket = io(this.serverUrl, {
      auth: { token: this.token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;

    socket.on('sync', (data: SyncPayload) =>
      this.dispatchEvent(new CustomEvent<SyncPayload>('sync', { detail: data }))
    );
    socket.on('session:kicked', (data: KickedPayload) =>
      this.dispatchEvent(new CustomEvent<KickedPayload>('kicked', { detail: data }))
    );
    socket.on('combat:update', (data: CombatUpdatePayload) =>
      this.dispatchEvent(new CustomEvent<CombatUpdatePayload>('combatUpdate', { detail: data }))
    );
    socket.on('disconnect', (reason) =>
      this.dispatchEvent(new CustomEvent<DisconnectedDetail>('disconnected', { detail: { reason } }))
    );
    socket.on('connect_error', (err) =>
      this.dispatchEvent(new CustomEvent<ConnectErrorDetail>('connect_error', { detail: { message: err.message } }))
    );
    // Reconnection lifecycle events live on the Manager, not the Socket.
    socket.io.on('reconnect_attempt', (attempt) =>
      this.dispatchEvent(new CustomEvent<ReconnectingDetail>('reconnecting', { detail: { attempt } }))
    );
    socket.io.on('reconnect', () => this.dispatchEvent(new CustomEvent('reconnected')));
    socket.io.on('reconnect_failed', () => this.dispatchEvent(new CustomEvent('reconnect_failed')));
  }

  disconnectAndReset(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
  }

  sendCommand(text: string): Promise<CommandAck> {
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
