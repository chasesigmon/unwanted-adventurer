import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap } from '../../shared/maps.js';
import { STARTING_MAP, DIRECTIONS } from '../../shared/constants.js';
import type { AppConfig } from '../config/configuration.js';
import type { PlayerSnapshot, GameServer, GameSocket } from '../../shared/types.js';

const directionSchema = z.enum(DIRECTIONS);

// The socket-level counterpart to the auth HTTP surface — a bare gateway
// with exactly one real action ("move"), same connection lifecycle
// (rate-limit -> JWT -> Redis session validation -> per-socket command
// rate limiting) as the text game's much larger GameGateway, minus
// everything that's actually game logic there (combat, skills, monsters,
// items — none of which exist in this project).
@WebSocketGateway()
export class GameGateway implements OnGatewayInit<GameServer>, OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket> {
  @WebSocketServer()
  private server!: GameServer;

  private readonly commandLimiters = new Map<string, CommandRateLimiter>();
  private readonly commandLimiterOptions: CommandRateLimiterOptions;

  constructor(
    private readonly playersService: PlayersService,
    private readonly worldManager: WorldManagerService,
    private readonly authService: AuthService,
    private readonly sessionStore: SessionStoreService,
    private readonly activeConnections: ActiveConnectionsService,
    private readonly connectionLimiter: SocketConnectionLimiterService,
    configService: ConfigService<AppConfig, true>
  ) {
    this.commandLimiterOptions = {
      max: configService.get('commandRateLimitMax', { infer: true }),
      refillPerSec: configService.get('commandRateLimitRefillPerSec', { infer: true }),
    };
  }

  afterInit(server: GameServer): void {
    this.activeConnections.setServer(server);

    server.use(async (socket, next) => {
      const ip = socket.handshake.address;
      if (this.connectionLimiter.isRateLimited(ip)) {
        next(new Error('Too many connection attempts. Please slow down.'));
        return;
      }

      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Missing session token.'));
        return;
      }

      let payload: Awaited<ReturnType<AuthService['verifySessionToken']>>;
      try {
        payload = await this.authService.verifySessionToken(token);
      } catch {
        next(new Error('Invalid or expired session.'));
        return;
      }

      const valid = await this.sessionStore.isSessionValid(payload.username, payload.sessionId);
      if (!valid) {
        next(new Error('Session expired or replaced elsewhere.'));
        return;
      }

      socket.data.username = payload.username;
      next();
    });
  }

  private snapshotFor(client: GameSocket): PlayerSnapshot {
    return {
      username: client.data.username,
      race: client.data.race,
      map: client.data.map,
      row: client.data.row,
      col: client.data.col,
    };
  }

  private async persistPosition(client: GameSocket): Promise<void> {
    try {
      await this.playersService.updatePosition(client.data.username, {
        map: client.data.map,
        row: client.data.row,
        col: client.data.col,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player position:', message);
    }
  }

  async handleConnection(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.set(client.id, new CommandRateLimiter(this.commandLimiterOptions));
    this.activeConnections.setActiveSocket(username, client.id);

    let doc = null;
    try {
      doc = await this.playersService.findByUsername(username);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    const startingMap = getMap(STARTING_MAP);
    client.data.race = doc?.race ?? 'goblin';
    client.data.map = doc?.map ?? STARTING_MAP;
    client.data.row = doc?.row ?? Math.floor(startingMap.rows / 2);
    client.data.col = doc?.col ?? Math.floor(startingMap.cols / 2);

    this.worldManager.addPlayer(username, client.data.map, client.data.row, client.data.col);

    client.emit('sync', { player: this.snapshotFor(client) });
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.delete(client.id);
    this.activeConnections.clearActiveSocketIfCurrent(username, client.id);

    if (this.worldManager.getLocation(username)) {
      await this.persistPosition(client);
    }
    this.worldManager.removePlayer(username);
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() rawDirection: unknown
  ): Promise<{ ok: boolean; player: PlayerSnapshot; message?: string }> {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) {
      return { ok: false, player: this.snapshotFor(client), message: 'Slow down — too many moves.' };
    }

    const parsed = directionSchema.safeParse(rawDirection);
    if (!parsed.success) {
      return { ok: false, player: this.snapshotFor(client), message: 'Unknown direction.' };
    }

    const { username } = client.data;
    const result = this.worldManager.processMove(username, parsed.data);
    if (!result) {
      return { ok: false, player: this.snapshotFor(client), message: 'Your session was lost. Please reconnect.' };
    }

    if (!result.ok) {
      return { ok: false, player: this.snapshotFor(client), message: "You can't go that way." };
    }

    client.data.map = result.mapName;
    client.data.row = result.row;
    client.data.col = result.col;

    void this.persistPosition(client);

    const message = result.transitioned ? `You enter ${result.mapName}.` : undefined;
    return { ok: true, player: this.snapshotFor(client), message };
  }
}
