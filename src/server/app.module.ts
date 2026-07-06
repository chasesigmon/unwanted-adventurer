import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration.js';
import { RedisModule } from './redis/redis.module.js';
import { DatabaseModule } from './database/database.module.js';
import { PlayersModule } from './players/players.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { GameGatewayModule } from './game-gateway/game-gateway.module.js';
import { HealthModule } from './health/health.module.js';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
    RedisModule,
    DatabaseModule,
    PlayersModule,
    AuthModule,
    RoomsModule,
    RateLimitModule,
    GameGatewayModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
