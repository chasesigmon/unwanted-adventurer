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
  DropItemAck,
  LootDroppedChestAck,
  BuyAck,
  SellAck,
  BankAck,
  RestAtInnAck,
  PetCommandAck,
  CommandFollowerAttackAck,
  FollowerItemAck,
  AnimatedMonsterCommandAck,
  EatBrainsAck,
  SacrificeAck,
  CastReseraAck,
  OpenChestAck,
  TakeChestItemAck,
  LockTarget,
  TileTargetPayload,
  CanteenActionAck,
  CastSpellAck,
  AugueTargetPayload,
  UseItemAck,
  ChatPayload,
  WhoAck,
  StatTickPayload,
  WorldTimePayload,
  AllocatableStat,
  AllocateStatPointAck,
  PlayerSnapshot,
  AuctionListingSnapshot,
} from '../shared/types.js';
import type { Direction, Gender, HairColor, SkinTone, HouseName, SpecializationPath, PlayableRace } from '../shared/constants.js';
import type { EquipmentSlot } from '../shared/equipment.js';
import type { PetCommand, FollowerEquipmentSlot } from '../shared/pets.js';

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
  // A later follow-up ask: a specialization badge on the character-select
  // screen (see characterSelect.ts) — null until level 10 and chosen.
  specialization: string | null;
}
type CharactersResponse = { ok: true; characters: CharacterSummary[] } | { ok: false; error: string };
type CharacterResponse = { ok: true; character: CharacterSummary } | { ok: false; error: string };

// Owns auth (HTTP) and the game socket — the same shape as the text
// game's own NetworkManager, just talking to this project's much smaller
// protocol (one event: "move").
export class NetworkManager extends EventTarget {
  private serverUrl: string;
  socket: GameClientSocket | null = null;
  // The CURRENT character-level game-socket token only — set exclusively
  // by selectCharacter, used exclusively by connectSocket. Kept separate
  // from accountToken below (a later follow-up ask: "the logout from the
  // top right of the game [should] take you back out to character
  // selection" — going back needs the ORIGINAL account token still
  // around to re-list characters with, which selectCharacter used to
  // overwrite this same field with and lose forever).
  private token: string | null = null;
  // The ACCOUNT-level token from register/login — survives selecting (or
  // re-selecting) any number of characters; only a real full logout
  // clears it. listCharacters/createCharacter/selectCharacter/
  // deleteCharacter all authenticate with this one, never `token`.
  // Mirrored into localStorage (same "persist small bits of client state,
  // guard the read/write in a try/catch for private-browsing" convention
  // actionBar.ts/log.ts already use) so returning to character select —
  // which reloads the page, see statusBar.ts's own logout button — can
  // pick it back up without making the player log in again.
  private accountToken: string | null = null;
  private static readonly ACCOUNT_TOKEN_STORAGE_KEY = 'accountToken';

  private setAccountToken(token: string | null): void {
    this.accountToken = token;
    try {
      if (token) localStorage.setItem(NetworkManager.ACCOUNT_TOKEN_STORAGE_KEY, token);
      else localStorage.removeItem(NetworkManager.ACCOUNT_TOKEN_STORAGE_KEY);
    } catch {
      /* localStorage unavailable (private browsing etc.) — not worth surfacing */
    }
  }

  // Called once at page load (see main.ts) — if a token was left behind
  // by a previous session, verifies it's still actually valid (rather
  // than trusting it blindly forever) by trying to list characters with
  // it before committing to skipping the login screen.
  async restoreAccountSession(): Promise<boolean> {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(NetworkManager.ACCOUNT_TOKEN_STORAGE_KEY);
    } catch {
      return false;
    }
    if (!stored) return false;
    this.accountToken = stored;
    try {
      await this.listCharacters();
      return true;
    } catch {
      this.setAccountToken(null);
      return false;
    }
  }

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
    this.setAccountToken(token);
  }

  async login(username: string, password: string): Promise<void> {
    const { token } = await this.authFetch('/auth/login', { username, password });
    this.setAccountToken(token);
  }

  async listCharacters(): Promise<CharacterSummary[]> {
    const res = await fetch(`${this.serverUrl}/characters`, {
      headers: { Authorization: `Bearer ${this.accountToken}` },
    });
    const data = (await res.json().catch(() => null)) as CharactersResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    return data.characters;
  }

  async createCharacter(name: string, race: PlayableRace, gender: Gender, hairColor: HairColor, skinTone: SkinTone): Promise<CharacterSummary> {
    const res = await fetch(`${this.serverUrl}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accountToken}` },
      body: JSON.stringify({ name, race, gender, hairColor, skinTone }),
    });
    const data = (await res.json().catch(() => null)) as CharacterResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    return data.character;
  }

  // Issues a character-level token (held ONLY in `token`, see its own
  // doc comment) — only after this does connectSocket() below have a
  // token the game socket will actually accept. The account token this
  // authenticates WITH is untouched, so selecting again (including after
  // returning from in-game via leaveCharacterSession below) always works.
  async selectCharacter(name: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/characters/${encodeURIComponent(name)}/select`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accountToken}` },
    });
    const data = (await res.json().catch(() => null)) as AuthResponse | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
    this.token = data.token;
  }

  // A follow-up ask: "the ability for people to delete players from
  // their character selection page" — permanent, same account-token
  // ownership check server-side as select/create above.
  async deleteCharacter(name: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/characters/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accountToken}` },
    });
    const data = (await res.json().catch(() => null)) as AuthResponse | { ok: true } | null;
    if (!res.ok || !data || !data.ok) {
      throw new Error(data && !data.ok ? data.error : 'Request failed.');
    }
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
    socket.on('combatNotice', (message: string) => this.dispatchEvent(new CustomEvent<string>('combatNotice', { detail: message })));
    socket.on('selfDamage', (data: { damage: number }) => this.dispatchEvent(new CustomEvent<{ damage: number }>('selfDamage', { detail: data })));
    socket.on('followerEngaged', (data) => this.dispatchEvent(new CustomEvent<{ targetKind: 'monster' | 'player'; targetId: string }>('followerEngaged', { detail: data })));
    // A later follow-up ask: "Create an Auction House in both Floro and
    // Kortho... make sure the duration on the auction house modal is
    // updated immediately with each change" — broadcast to every
    // connected socket whenever any listing changes (see AuctionHouseService's
    // own doc comment on why this is global, not per-map).
    socket.on('auctionState', (listings: AuctionListingSnapshot[]) =>
      this.dispatchEvent(new CustomEvent<AuctionListingSnapshot[]>('auctionState', { detail: listings }))
    );
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

  // A later follow-up ask: "the logout from the top right of the game
  // [should] take you back out to character selection" — auth.service.ts's
  // own logout(token) already branches on WHICH KIND of token it's handed
  // (see its own payload.kind check): handing it the CHARACTER token only
  // clears that one character's session/connection, leaving the account
  // session (and accountToken here) fully intact to go back and pick
  // again — a real, if lighter-weight, server-side logout, not just a
  // client-side screen swap.
  async leaveCharacterSession(): Promise<void> {
    const token = this.token;
    this.socket?.disconnect();
    this.socket = null;
    this.token = null;
    if (!token) return;
    try {
      await fetch(`${this.serverUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* best-effort — the local character session is already torn down above */
    }
  }

  // Invalidates the ACCOUNT session server-side (see auth.controller.ts's
  // own /auth/logout, and auth.service.ts's own logout(token) branching
  // on the account-kind token this passes) before tearing down the
  // socket — best-effort: even if the HTTP call fails (server
  // unreachable, token already expired), the client still disconnects
  // and forgets both tokens locally either way. This is the "fully log
  // the person out so they'd have to login again or register" path —
  // see leaveCharacterSession above for the lighter "back to character
  // select" one.
  async logout(): Promise<void> {
    const token = this.accountToken;
    this.disconnectAndReset();
    this.setAccountToken(null);
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

  // Item 1: diagonal movement (e.g. W+A held together) — same shape/
  // timeout-guard reasoning as move() above.
  moveDiagonal(dRow: -1 | 1, dCol: -1 | 1): Promise<MoveAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.timeout(5000).emit('moveDiagonal', { dRow, dCol }, (err: Error | null, res?: MoveAck) => {
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

  // The wand's ranged auto-attack (a follow-up ask) — arms/refreshes a
  // sustained session the server keeps resolving every combat tick on its
  // own (see game.gateway.ts's handleEngageRangedAttack); ack-based so an
  // immediate rejection (no wand, out of range) shows right away.
  engageRangedAttack(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('engageRangedAttack', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // A later follow-up bug fix (a melee approach had no server round-trip
  // at all until contact, so the monster never started chasing back) —
  // no ack needed, same fire-and-forget shape as punch/chat.
  engageMelee(target: AugueTargetPayload): void {
    this.socket?.emit('engageMelee', target);
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

  lootGold(corpseId: string): Promise<LootAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootGold', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  dropItem(itemIndex: number): Promise<DropItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('dropItem', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  lootDroppedChest(chestId: string): Promise<LootDroppedChestAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootDroppedChest', chestId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  lootDroppedChestItem(chestId: string, itemIndex: number): Promise<LootDroppedChestAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootDroppedChestItem', { chestId, itemIndex }, (res) => {
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

  // A later follow-up ask: "sell to vendor".
  sellItem(vendorId: string, itemIndex: number): Promise<SellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('sellItem', { vendorId, itemIndex }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // A later follow-up ask: "Create an Auction House in both Floro and
  // Kortho."
  auctionGetListings(): Promise<{ ok: true; listings: AuctionListingSnapshot[] }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('auctionGetListings', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  auctionListItem(itemIndex: number, startingGold: number, durationMinutes: number): Promise<{ ok: boolean; message?: string; listings?: AuctionListingSnapshot[] }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('auctionListItem', { itemIndex, startingGold, durationMinutes }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  auctionBid(auctionId: string, amount: number): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('auctionBid', { auctionId, amount }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Item 17's Bank vendor — amount omitted deposits/withdraws everything.
  depositGold(amount?: number): Promise<BankAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('depositGold', { amount }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  withdrawGold(amount?: number): Promise<BankAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('withdrawGold', { amount }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Item 30's Kortho/Floro Inn "Stay and rest" service.
  restAtInn(): Promise<RestAtInnAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('restAtInn', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  petCommand(command: PetCommand): Promise<PetCommandAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('petCommand', command, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The 'z' hotkey (a later follow-up ask) — commands every living pet/
  // animated monster the caller owns to approach and attack the given
  // target.
  commandFollowerAttack(payload: { targetKind: 'monster' | 'player'; targetId: string }): Promise<CommandFollowerAttackAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('commandFollowerAttack', payload, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Phase C's "give/equip" ask — followerId is only needed for an
  // animated monster (an owner can have more than one); a pet needs none.
  giveFollowerItem(payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number }): Promise<FollowerItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('giveFollowerItem', payload, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  takeFollowerItem(payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number }): Promise<FollowerItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('takeFollowerItem', payload, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  equipFollowerItem(payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number }): Promise<FollowerItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('equipFollowerItem', payload, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  unequipFollowerItem(payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; slot: FollowerEquipmentSlot }): Promise<FollowerItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('unequipFollowerItem', payload, (res) => {
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

  // A later follow-up ask: pet corpses — same loot/loot-one/sacrifice
  // shape as the monster-corpse trio above, see shared/types.ts's own
  // doc comment on why these are separate events.
  lootPetCorpse(corpseId: string): Promise<LootAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootPetCorpse', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  lootPetCorpseItem(corpseId: string, itemIndex: number): Promise<LootAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('lootPetCorpseItem', { corpseId, itemIndex }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  sacrificePetCorpse(corpseId: string): Promise<SacrificeAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('sacrificePetCorpse', corpseId, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  drinkItem(itemIndex: number): Promise<CanteenActionAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('drinkItem', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  pourItem(itemIndex: number): Promise<CanteenActionAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('pourItem', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castIrrigo(itemIndex: number): Promise<CanteenActionAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castIrrigo', itemIndex, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Ack-based (a follow-up ask, replacing the old fire-and-forget
  // '/lucem' chat command) so the result can be toasted even with a
  // modal open — see WorldScene's useTargetedSkill.
  castLucem(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castLucem', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castCeleritas(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castCeleritas', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Augue (a later follow-up ask) needs a target, unlike lucem/celeritas
  // above — see WorldScene's useTargetedSkill.
  castAugue(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castAugue', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The Elementalist's own 4 bolts (a later follow-up ask) — same target
  // shape as augue above.
  castFireBolt(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castFireBolt', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castWaterBolt(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castWaterBolt', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castAirBolt(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castAirBolt', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castEarthBolt(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castEarthBolt', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castLesserHeal(target: AugueTargetPayload | null): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castLesserHeal', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castSapHealth(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castSapHealth', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castKineticStrike(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castKineticStrike', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castIdentify(itemIndex: number): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castIdentify', { itemIndex }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castTameBeast(targetId: string): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castTameBeast', { targetId }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Item 11's Transform spell — kind is one of myProfile's own
  // tamedBeastKinds, picked from the transform picker modal.
  castTransform(kind: string): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castTransform', { kind }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  tamedBeastCommand(command: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('tamedBeastCommand', command, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  removeTamedBeast(): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('removeTamedBeast', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // A later follow-up ask: "add a 'Remove' option to the pet window" —
  // same shape as removeTamedBeast above.
  removePet(): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('removePet', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castLesserSelfHeal(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castLesserSelfHeal', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castWispTransformation(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castWispTransformation', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castFlight(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castFlight', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  flightBurst(direction: Direction): Promise<{ ok: boolean; player: PlayerSnapshot; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('flightBurst', direction, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // Resera (a later follow-up ask) targets a door or chest, not a combat
  // target — see WorldScene's own lockTarget field.
  castResera(target: LockTarget): Promise<CastReseraAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castResera', { target }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  openChest(): Promise<OpenChestAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('openChest', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  takeChestItem(): Promise<TakeChestItemAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('takeChestItem', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The 'x' hotkey (a later follow-up ask) — no ack needed, same
  // fire-and-forget shape as chat/punch.
  disengage(): void {
    this.socket?.emit('disengage');
  }

  // The character sheet's own stat-point allocation (a later follow-up
  // ask) — see game.gateway.ts's handleAllocateStatPoint.
  allocateStatPoint(stat: AllocatableStat): Promise<AllocateStatPointAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('allocateStatPoint', { stat }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // A quest-giver's own "Quest: <title>" button (a follow-up ask) — see
  // game.gateway.ts's handleStartQuest.
  startQuest(questId: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('startQuest', { questId }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The "Complete Quest" button (a follow-up ask) — see
  // game.gateway.ts's handleCompleteQuest.
  completeQuest(questId: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('completeQuest', { questId }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The house-assignment teacher's own dialogue (a follow-up ask) — see
  // game.gateway.ts's handleChooseHouse.
  chooseHouse(house: HouseName): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('chooseHouse', { house }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The Specialization room's own path choice (a follow-up ask) — see
  // game.gateway.ts's handleChooseSpecialization.
  chooseSpecialization(path: SpecializationPath): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('chooseSpecialization', { path }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The classroom/specialization teacher click-to-learn modal (a later
  // follow-up ask replaced the old podium-reading skill system, and
  // migrated the Necromancer's own bespoke animate-dead purchase onto
  // this same generic handler) — see game.gateway.ts's handleLearnSkill.
  learnSkill(skill: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('learnSkill', { skill }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castStupefaciunt(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castStupefaciunt', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castExarme(target: AugueTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castExarme', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castScutum(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castScutum', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castEnhanceDamage(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castEnhanceDamage', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castMurusLapideus(target: TileTargetPayload): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castMurusLapideus', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castAnimateDead(corpseId: string): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castAnimateDead', { corpseId }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The Utility Classroom's own level-15 spell (a later follow-up ask) —
  // reworked to a single settable recall point (see game.gateway.ts's
  // handleCastRecall) — no poiId anymore, the server just teleports to
  // whichever point the player last set via setRecallPoint below.
  castRecall(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castRecall', {}, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // "The player must set one location to be their recall choice at a
  // time... travel to the respective place... use recall... 'Set <name>
  // as recall point'" — a free action (no mana/cooldown, see
  // game.gateway.ts's handleSetRecallPoint), gated only on physically
  // standing in one of shared/recall.ts's RECALL_POINTS maps right now.
  setRecallPoint(): Promise<{ ok: boolean; message?: string; recallPointId?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('setRecallPoint', {}, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castInvisibility(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castInvisibility', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castCreateDuplicate(): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castCreateDuplicate', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castSummonDemonImp(): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castSummonDemonImp', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  castMonsterSummons(monsterKind: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castMonsterSummons', { monsterKind }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // The Defense Classroom's own level-10 spell (a later follow-up ask) —
  // see game.gateway.ts's handleCastBarrier.
  castBarrier(): Promise<CastSpellAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('castBarrier', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  animatedMonsterCommand(id: string, command: PetCommand): Promise<AnimatedMonsterCommandAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('animatedMonsterCommand', { id, command }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  removeAnimatedMonster(id: string): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('removeAnimatedMonster', { id }, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  sleepInBed(target: TileTargetPayload): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('sleepInBed', target, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  // A bench (a follow-up ask) — see game.gateway.ts's handleRestOnBench.
  restOnBench(target: TileTargetPayload): Promise<{ ok: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('restOnBench', target, (res) => {
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

  // ===== TESTING OVERRIDE — REMOVE AFTER TESTING ===== bound to the '~'
  // key (see WorldScene's create()) — restores mana to full.
  cheatFullMana(): Promise<SyncPayload> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected.'));
        return;
      }
      this.socket.emit('cheatFullMana', (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }
}
