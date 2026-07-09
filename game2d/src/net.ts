import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SyncPayload,
  MoveAck,
  KickedPayload,
  MapStatePayload,
  PunchPayload,
  CombatEventPayload,
  LootAck,
} from '../shared/types.js';
import type { Direction } from '../shared/constants.js';

type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type AuthResponse = { ok: true; token: string } | { ok: false; error: string };

// Owns auth (HTTP) and the game socket — the same shape as the text
// game's own NetworkManager, just talking to this project's much smaller
// protocol (one event: "move").
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

  async register(username: string, password: string, race: string): Promise<void> {
    const { token } = await this.authFetch('/auth/register', { username, password, race });
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

    socket.on('sync', (data: SyncPayload) => this.dispatchEvent(new CustomEvent<SyncPayload>('sync', { detail: data })));
    socket.on('session:kicked', (data: KickedPayload) =>
      this.dispatchEvent(new CustomEvent<KickedPayload>('kicked', { detail: data }))
    );
    socket.on('map:state', (data: MapStatePayload) =>
      this.dispatchEvent(new CustomEvent<MapStatePayload>('map:state', { detail: data }))
    );
    socket.on('punch', (data: PunchPayload) => this.dispatchEvent(new CustomEvent<PunchPayload>('punch', { detail: data })));
    socket.on('combat', (data: CombatEventPayload) =>
      this.dispatchEvent(new CustomEvent<CombatEventPayload>('combat', { detail: data }))
    );
    socket.on('disconnect', (reason) => this.dispatchEvent(new CustomEvent('disconnected', { detail: { reason } })));
    socket.on('connect_error', (err) =>
      this.dispatchEvent(new CustomEvent('connect_error', { detail: { message: err.message } }))
    );
  }

  disconnectAndReset(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
  }

  move(direction: Direction): Promise<MoveAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('move', direction, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // No ack — purely cosmetic, so there's nothing worth waiting on.
  punch(direction: Direction): void {
    this.socket?.emit('punch', direction);
  }

  loot(corpseId: string): Promise<LootAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('loot', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }
}
