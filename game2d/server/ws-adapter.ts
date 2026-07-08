import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ServerOptions } from 'socket.io';
import type { AppConfig } from './config/configuration.js';

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
      pingInterval: this.configService.get('heartbeatPingIntervalMs', { infer: true }),
      pingTimeout: this.configService.get('heartbeatPingTimeoutMs', { infer: true }),
    };
    return super.createIOServer(port, mergedOptions);
  }
}
