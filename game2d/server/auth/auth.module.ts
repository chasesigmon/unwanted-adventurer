import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { PlayersModule } from '../players/players.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionStoreService } from './session-store.service.js';
import { ActiveConnectionsService } from './active-connections.service.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    PlayersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('jwtSecret', { infer: true }),
        signOptions: { expiresIn: configService.get('jwtExpiresIn', { infer: true }) },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        throttlers: [
          {
            ttl: configService.get('socketConnRateLimitWindowMs', { infer: true }),
            limit: configService.get('socketConnRateLimitMax', { infer: true }),
          },
        ],
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionStoreService, ActiveConnectionsService],
  exports: [AuthService, SessionStoreService, ActiveConnectionsService],
})
export class AuthModule {}
