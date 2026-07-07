import { randomUUID } from 'crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';

import { PlayersService } from '../players/players.service.js';
import { SessionStoreService } from './session-store.service.js';
import { ActiveConnectionsService } from './active-connections.service.js';
import { getMap } from '../game/maps.js';
import { STARTING_MAP } from '../../shared/constants.js';
import type { AppConfig } from '../config/configuration.js';
import type { CredentialsDto, RegisterCredentialsDto } from './dto/credentials.dto.js';

export interface SessionTokenPayload {
  username: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly playersService: PlayersService,
    private readonly sessionStore: SessionStoreService,
    private readonly activeConnections: ActiveConnectionsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>
  ) {}

  private hashPassword(plainPassword: string): Promise<string> {
    // bcryptjs: pure-JS implementation of the same bcrypt algorithm as the
    // native `bcrypt` package — no native compilation step to install it.
    return bcrypt.hash(plainPassword, this.configService.get('bcryptSaltRounds', { infer: true }));
  }

  private verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  private async issueSession(username: string): Promise<string> {
    const sessionId = randomUUID();
    await this.sessionStore.setActiveSession(username, sessionId);
    const payload: SessionTokenPayload = { username, sessionId };
    return this.jwtService.signAsync(payload);
  }

  // Throws if the token is malformed, expired, or signed with a different secret.
  verifySessionToken(token: string): Promise<SessionTokenPayload> {
    return this.jwtService.verifyAsync<SessionTokenPayload>(token);
  }

  async register({ username, password, race }: RegisterCredentialsDto): Promise<{ token: string }> {
    const existing = await this.playersService.findByUsernameCaseInsensitive(username);
    if (existing) {
      throw new ConflictException('That username is already taken.');
    }

    const startingMap = getMap(STARTING_MAP);
    const passwordHash = await this.hashPassword(password);

    await this.playersService.create({
      username,
      passwordHash,
      race,
      map: STARTING_MAP,
      row: Math.floor(startingMap.rows / 2),
      col: Math.floor(startingMap.cols / 2),
    });

    const token = await this.issueSession(username);
    return { token };
  }

  async login({ username, password }: CredentialsDto): Promise<{ token: string }> {
    const doc = await this.playersService.findByUsernameCaseInsensitive(username);
    const passwordOk = doc ? await this.verifyPassword(password, doc.passwordHash) : false;
    if (!doc || !passwordOk) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    // Kick whatever session (if any) is currently connected for this user
    // before installing the new one.
    this.activeConnections.kickIfConnected(
      doc.username,
      'You were logged out because your account signed in elsewhere.'
    );

    await this.playersService.touchLastLogin(doc.username);
    const token = await this.issueSession(doc.username);
    return { token };
  }

  async logout(token: string): Promise<void> {
    let payload: SessionTokenPayload;
    try {
      payload = await this.verifySessionToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    await this.sessionStore.clearActiveSession(payload.username);
    this.activeConnections.disconnectIfConnected(payload.username);
  }
}
