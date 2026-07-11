import { randomUUID } from 'crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';

import { AccountsService } from '../accounts/accounts.service.js';
import { PlayersService } from '../players/players.service.js';
import { SessionStoreService } from './session-store.service.js';
import { ActiveConnectionsService } from './active-connections.service.js';
import { getMap } from '../../shared/maps.js';
import { STARTING_MAP } from '../../shared/constants.js';
import { startingSkills } from '../combat/formulas.js';
import type { AppConfig } from '../config/configuration.js';
import type { CredentialsDto, RegisterAccountDto, CreateCharacterDto } from './dto/credentials.dto.js';

// An account-level token — proves who's logged in, but not which
// character (if any) they're playing. Can't be used to connect the game
// socket directly (see GameGateway's own verifySessionToken check).
export interface AccountSessionTokenPayload {
  kind: 'account';
  accountId: number;
  username: string;
  sessionId: string;
}

// A character-level token — the exact same shape this project's session
// token always had, now explicitly tagged so it can't be confused with
// the account-level token above.
export interface CharacterSessionTokenPayload {
  kind: 'character';
  username: string;
  sessionId: string;
}

export type AnySessionTokenPayload = AccountSessionTokenPayload | CharacterSessionTokenPayload;

export interface CharacterSummary {
  name: string;
  race: string;
  level: number;
  map: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly playersService: PlayersService,
    private readonly sessionStore: SessionStoreService,
    private readonly activeConnections: ActiveConnectionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>
  ) {}

  private hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.configService.get('bcryptSaltRounds', { infer: true }));
  }

  private verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  private async issueAccountSession(accountId: number, username: string): Promise<string> {
    const sessionId = randomUUID();
    await this.sessionStore.setActiveSession('account', username, sessionId);
    const payload: AccountSessionTokenPayload = { kind: 'account', accountId, username, sessionId };
    return this.jwtService.signAsync(payload);
  }

  private async issueCharacterSession(username: string): Promise<string> {
    const sessionId = randomUUID();
    await this.sessionStore.setActiveSession('character', username, sessionId);
    const payload: CharacterSessionTokenPayload = { kind: 'character', username, sessionId };
    return this.jwtService.signAsync(payload);
  }

  async verifyAnyToken(token: string): Promise<AnySessionTokenPayload> {
    return this.jwtService.verifyAsync<AnySessionTokenPayload>(token);
  }

  private async verifyAccountToken(token: string): Promise<AccountSessionTokenPayload> {
    const payload = await this.verifyAnyToken(token);
    if (payload.kind !== 'account') {
      throw new UnauthorizedException('An account session is required for this action.');
    }
    return payload;
  }

  // Used only by the game gateway's own socket handshake — rejects
  // anything but a real character-level token, so an account-level token
  // (e.g. one still sitting on the character-select screen) can never be
  // used to connect the game socket directly.
  async verifyCharacterToken(token: string): Promise<CharacterSessionTokenPayload> {
    const payload = await this.verifyAnyToken(token);
    if (payload.kind !== 'character') {
      throw new UnauthorizedException('A character session is required to connect.');
    }
    return payload;
  }

  isCharacterSessionValid(username: string, sessionId: string): Promise<boolean> {
    return this.sessionStore.isSessionValid('character', username, sessionId);
  }

  // ---------- Account-level: register/login/logout ----------

  async register({ email, username, password }: RegisterAccountDto): Promise<{ token: string }> {
    const [existingUsername, existingEmail] = await Promise.all([
      this.accountsService.findByUsernameCaseInsensitive(username),
      this.accountsService.findByEmailCaseInsensitive(email),
    ]);
    if (existingUsername) throw new ConflictException('That username is already taken.');
    if (existingEmail) throw new ConflictException('That email is already registered.');

    const passwordHash = await this.hashPassword(password);
    const account = await this.accountsService.create({ email, username, passwordHash });

    const token = await this.issueAccountSession(account.id, account.username);
    return { token };
  }

  async login({ username, password }: CredentialsDto): Promise<{ token: string }> {
    const account = await this.accountsService.findByUsernameCaseInsensitive(username);
    const passwordOk = account ? await this.verifyPassword(password, account.passwordHash) : false;
    if (!account || !passwordOk) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const token = await this.issueAccountSession(account.id, account.username);
    return { token };
  }

  // Accepts either token kind — an account-only session (never picked a
  // character) or a character session (mid-game) — and clears whichever
  // one it actually was.
  async logout(token: string): Promise<void> {
    let payload: AnySessionTokenPayload;
    try {
      payload = await this.verifyAnyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (payload.kind === 'account') {
      await this.sessionStore.clearActiveSession('account', payload.username);
      return;
    }
    await this.sessionStore.clearActiveSession('character', payload.username);
    this.activeConnections.disconnectIfConnected(payload.username);
  }

  // ---------- Character-level: list/create/select (item 1) ----------

  async listCharacters(accountToken: string): Promise<CharacterSummary[]> {
    const { accountId } = await this.verifyAccountToken(accountToken);
    const characters = await this.playersService.findByAccountId(accountId);
    return characters.map((c) => ({ name: c.username, race: c.race, level: c.level, map: c.map }));
  }

  async createCharacter(accountToken: string, { name, race }: CreateCharacterDto): Promise<CharacterSummary> {
    const { accountId } = await this.verifyAccountToken(accountToken);

    const existing = await this.playersService.findByUsernameCaseInsensitive(name);
    if (existing) {
      throw new ConflictException('That character name is already taken.');
    }

    const startingMap = getMap(STARTING_MAP);
    const player = await this.playersService.create({
      username: name,
      accountId,
      race,
      map: STARTING_MAP,
      row: Math.floor(startingMap.rows / 2),
      col: Math.floor(startingMap.cols / 2),
      skills: startingSkills(race),
    });

    return { name: player.username, race: player.race, level: player.level, map: player.map };
  }

  // Picking a character from the select screen (or one just created) is
  // what actually issues the character-level session token the game
  // socket connects with — same shape/mechanism this project's login
  // always used, just moved one step later in the flow.
  async selectCharacter(accountToken: string, characterName: string): Promise<{ token: string }> {
    const { accountId } = await this.verifyAccountToken(accountToken);
    const character = await this.playersService.findByUsernameCaseInsensitive(characterName);
    if (!character) {
      throw new NotFoundException('Character not found.');
    }
    if (character.accountId !== accountId) {
      throw new ForbiddenException("That character doesn't belong to this account.");
    }
    if (character.condemned) {
      throw new ForbiddenException(
        `${character.username} has met CONDEATH after ${character.deathCount} deaths and can never be played again.`
      );
    }

    // Same duplicate-login protection the old direct-login flow had —
    // now checked at character-select time instead, since that's the
    // moment a specific character's socket is actually about to connect.
    this.activeConnections.kickIfConnected(
      character.username,
      'You were logged out because this character signed in elsewhere.'
    );

    await this.playersService.touchLastLogin(character.username);
    const token = await this.issueCharacterSession(character.username);
    return { token };
  }
}
