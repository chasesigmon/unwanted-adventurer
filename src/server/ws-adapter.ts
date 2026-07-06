import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ServerOptions } from 'socket.io';
import type { AppConfig } from './config/configuration.js';

// Centralizes Socket.io-specific options (CORS + heartbeat) in one place,
// applied to the single underlying `Server` instance Nest creates —
// equivalent to what used to be passed directly into `new Server(...)`.
export class WsAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService<AppConfig, true>
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): unknown {
    const mergedOptions: Partial<ServerOptions> = {
      ...options,
      cors: {
        origin: this.configService.get('clientOrigin', { infer: true }),
        methods: ['GET', 'POST'],
      },
      // Ping/pong heartbeat: how often the server probes each client, and
      // how long it waits for a pong before treating the connection as dead.
      pingInterval: this.configService.get('heartbeatPingIntervalMs', { infer: true }),
      pingTimeout: this.configService.get('heartbeatPingTimeoutMs', { infer: true }),
    };
    return super.createIOServer(port, mergedOptions);
  }
}
