import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlayersModule } from '../players/players.module.js';
import { WorldsModule } from '../worlds/worlds.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { GameGateway } from './game.gateway.js';

@Module({
  imports: [ConfigModule, PlayersModule, WorldsModule, AuthModule, RateLimitModule],
  providers: [GameGateway],
})
export class GameGatewayModule {}
