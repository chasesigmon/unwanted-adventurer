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

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import { getMap } from '../game/maps.js';
import { resolveRoom } from '../game/room.js';
import { STARTING_MAP } from '../../shared/constants.js';
import { DIRECTION_ALIASES } from '../../shared/directions.js';
import { commandSchema } from './command.schema.js';
import type { AppConfig } from '../config/configuration.js';
import type { GameServer, GameSocket, CommandAck } from './types.js';

// cors/heartbeat are configured centrally in ws-adapter.ts, not here — this
// stays a bare gateway so there's exactly one place that owns those options.
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

    // Runs on every handshake, before 'connection' fires: connection-rate
    // limiting, then JWT + Redis session validation. A stale token
    // (expired, or superseded by a newer login elsewhere) is rejected here
    // rather than ever reaching game logic.
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

  async handleConnection(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.set(client.id, new CommandRateLimiter(this.commandLimiterOptions));
    this.activeConnections.setActiveSocket(username, client.id);

    const startingMap = getMap(STARTING_MAP);
    let doc = null;
    try {
      doc = await this.playersService.findByUsername(username);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    const mapName = doc?.map ?? STARTING_MAP;
    const row = doc?.row ?? Math.floor(startingMap.rows / 2);
    const col = doc?.col ?? Math.floor(startingMap.cols / 2);

    await this.worldManager.addPlayer(username, mapName, row, col);

    client.emit('sync', {
      player: { username, map: mapName, row, col },
      minimap: this.worldManager.getMinimap(username) ?? [],
      room: resolveRoom({ mapName, row, col }),
    });
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.delete(client.id);
    this.activeConnections.clearActiveSocketIfCurrent(username, client.id);

    const loc = this.worldManager.getLocation(username);
    this.worldManager.removePlayer(username);
    if (loc) {
      try {
        await this.playersService.updatePosition(username, { map: loc.mapName, row: loc.row, col: loc.col });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[db] could not persist player on disconnect:', message);
      }
    }
  }

  // Returning a value here becomes the ack the client's emit() callback
  // receives (Nest's built-in behavior for WS handlers with a client-side
  // acknowledgement) — no need to accept/call the raw ack function.
  @SubscribeMessage('command')
  async handleCommand(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() rawText: string
  ): Promise<CommandAck> {
    const { username } = client.data;
    const limiter = this.commandLimiters.get(client.id);

    if (!limiter?.tryConsume()) {
      return { ok: false, message: 'Slow down — too many commands.' };
    }

    const parsed = commandSchema.safeParse(rawText);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid command.' };
    }
    const text = parsed.data.toLowerCase();

    if (text === 'logout') {
      await this.sessionStore.clearActiveSession(username);
      this.activeConnections.clearActiveSocketIfCurrent(username, client.id);
      // Deferred so the ack (this return value) reaches the client before
      // the connection tears down — the ack is dispatched as a microtask
      // continuation of this handler's promise, which always runs before
      // this setImmediate's macrotask callback.
      setImmediate(() => client.disconnect(true));
      return { ok: true, message: 'You have logged out.', loggedOut: true };
    }

    const direction = DIRECTION_ALIASES[text];
    if (!direction) {
      const loc = this.worldManager.getLocation(username);
      const ackPayload: CommandAck = {
        ok: false,
        message: `Unknown command: "${rawText}".`,
        minimap: this.worldManager.getMinimap(username),
      };
      if (loc) {
        ackPayload.player = { username, map: loc.mapName, row: loc.row, col: loc.col };
        ackPayload.room = resolveRoom(loc);
      }
      return ackPayload;
    }

    const fromMap = this.worldManager.getLocation(username)?.mapName ?? 'the world';
    const result = await this.worldManager.processCommand(username, direction);

    if (!result) {
      return { ok: false, message: 'Your session was lost. Please reconnect.' };
    }

    let message: string;
    if (!result.ok) {
      message = `${username} can't move ${direction} — that's the edge of ${fromMap}.`;
    } else if (result.transitioned) {
      message = `${username} moved ${direction} and left ${result.fromMap} for ${result.mapName}.`;
    } else {
      message = `${username} moved ${direction}.`;
    }

    const loc = this.worldManager.getLocation(username);
    if (!loc) {
      return { ok: false, message: 'Your session was lost. Please reconnect.' };
    }

    return {
      ok: result.ok,
      message,
      player: { username, map: loc.mapName, row: loc.row, col: loc.col },
      minimap: this.worldManager.getMinimap(username),
      room: resolveRoom(loc),
    };
  }
}
