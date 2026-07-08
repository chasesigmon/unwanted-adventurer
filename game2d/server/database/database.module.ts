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
        // Fail fast rather than retry-looping — make sure Mongo is up
        // (docker compose up -d mongo redis, from the repo root) before
        // starting this server.
        retryAttempts: 0,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
