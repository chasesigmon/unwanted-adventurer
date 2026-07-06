import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/configuration.js';
import { REDIS_CLIENT } from './redis.constants.js';

// Global so any feature module can @Inject(REDIS_CLIENT) without importing
// RedisModule directly everywhere. ioredis itself is fire-and-forget on
// connection failure (auto-reconnects, emits 'error' without throwing), so
// unlike Mongo this never blocks app bootstrap.
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const client = new Redis(configService.get('redisUrl', { infer: true }), {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        });
        client.on('error', (err: Error) => {
          console.warn('[redis] connection error:', err.message);
        });
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
