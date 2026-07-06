import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        uri: configService.get('mongoUri', { infer: true }),
        serverSelectionTimeoutMS: 2500,
        // Fail fast rather than Nest's default 10-retry/3s-apart loop —
        // matches this project's original "don't hang startup" philosophy.
        // Note: unlike the previous hand-rolled connectDB(), a failed
        // connection now prevents the whole app from booting rather than
        // degrading to in-memory/no-persistence mode; @nestjs/mongoose
        // doesn't support the latter cleanly. Make sure Mongo is up
        // (docker compose up -d mongo redis) before starting the server.
        retryAttempts: 0,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
