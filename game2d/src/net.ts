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
  BuyAck,
  EatBrainsAck,
  SacrificeAck,
  UseItemAck,
  ChatPayload,
  WhoAck,
  StatTickPayload,
  WorldTimePayload,
} from '../shared/types.js';
import type { Direction, Gender, HairColor, SkinTone } from '../shared/constants.js';
import type { EquipmentSlot } from '../shared/equipment.js';

type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type AuthResponse = { ok: true; token: string } | { ok: false; error: string };

export interface CharacterSummary {
  name: string;
  race: string;
  gender: Gender | null;
  hairColor: HairColor | null;
  skinTone: SkinTone | null;
  level: number;
  map: string;
}
type CharactersResponse = { ok: true; characters: CharacterSummary[] } | { ok: false; error: string };
type CharacterResponse = { ok: true; character: CharacterSummary } | { ok: false; error: string };

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

  // Registers an ACCOUNT (email/username/password, no race/character
  // name) — the returned token is account-level and can't connect the
  // game socket on its own; listCharacters/createCharacter/
  // selectCharacter below are what get from here to an actual playable
  // character.
  async register(email: string, username: string, password: string): Promise<void> {
    const { token } = await this.authFetch('/auth/register', { email, username, password });
    this.token = token;
  }

  async login(username: string, password: string): Promise<void> {
    const { token } = await this.authFetch('/auth/login', { username, password });
    this.token = token;
  }

  async listCharacters(): Promise<CharacterSummary[]> {
    const res = await fetch(`${this.serverUrl}/characters`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data = (await res.json().catch(() => null)) as CharactersResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    return data.characters;
  }

  async createCharacter(name: string, gender: Gender, hairColor: HairColor, skinTone: SkinTone): Promise<CharacterSummary> {
    const res = await fetch(`${this.serverUrl}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ name, gender, hairColor, skinTone }),
    });
    const data = (await res.json().catch(() => null)) as CharacterResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    return data.character;
  }

  // Swaps the held account-level token for a character-level one — only
  // after this does connectSocket() below have a token the game socket
  // will actually accept.
  async selectCharacter(name: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/characters/${encodeURIComponent(name)}/select`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data = (await res.json().catch(() => null)) as AuthResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    this.token = data.token;
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
    socket.on('chat', (data: ChatPayload) => this.dispatchEvent(new CustomEvent<ChatPayload>('chat', { detail: data })));
    socket.on('statTick', (data: StatTickPayload) =>
      this.dispatchEvent(new CustomEvent<StatTickPayload>('statTick', { detail: data }))
    );
    socket.on('worldTime', (data: WorldTimePayload) =>
      this.dispatchEvent(new CustomEvent<WorldTimePayload>('worldTime', { detail: data }))
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

  // Invalidates the session server-side (see auth.controller.ts's own
  // /auth/logout) before tearing down the socket — best-effort: even if
  // the HTTP call fails (server unreachable, token already expired), the
  // client still disconnects and forgets its token locally either way.
  async logout(): Promise<void> {
    const token = this.token;
    this.disconnectAndReset();
    if (!token) return;
    try {
      await fetch(`${this.serverUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* best-effort — the local session is already torn down above */
    }
  }

  move(direction: Direction): Promise<MoveAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      // A dropped/never-arriving ack here used to leave WorldScene's
      // isMoving stuck true forever (the same class of bug documented
      // elsewhere in this project — nothing else ever resets it outside
      // this callback), permanently freezing movement input. A timeout
      // guarantees the promise settles either way.
      this.socket.timeout(5000).emit('move', direction, (err: Error | null, res?: MoveAck) => {
        if (err || !res) reject(new Error('No response from server.'));
        else resolve(res);
      });
    });
  }

  // No ack — purely cosmetic, so there's nothing worth waiting on.
  punch(direction: Direction): void {
    this.socket?.emit('punch', direction);
  }

  // No ack — same fire-and-forget shape as punch. Used for any queued
  // skill besides the default punch/dagger swing (bone finger strike,
  // glare) — the server engages combat with this skill instead of the
  // default, the same way punch() does.
  useSkill(direction: Direction, skill: string): void {
    this.socket?.emit('useSkill', { direction, skill });
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

  useItem(itemIndex: number): Promise<UseItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('useItem', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  unequipItem(slot: EquipmentSlot): Promise<UseItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('unequipItem', slot, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  consumeItem(itemIndex: number): Promise<UseItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('consumeItem', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  lootItem(corpseId: string, itemIndex: number): Promise<LootAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootItem', { corpseId, itemIndex }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  buyItem(vendorId: string, itemLabel: string): Promise<BuyAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('buyItem', { vendorId, itemLabel }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  eatBrains(corpseId: string): Promise<EatBrainsAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('eatBrains', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  sacrificeCorpse(corpseId: string): Promise<SacrificeAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('sacrificeCorpse', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // No ack — purely cosmetic, same as punch.
  chat(message: string): void {
    this.socket?.emit('chat', message);
  }

  who(): Promise<WhoAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('who', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }
}
