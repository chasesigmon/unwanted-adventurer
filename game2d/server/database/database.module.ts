import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '../players/player.entity.js';
import { Account } from '../accounts/account.entity.js';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: configService.get('postgresUrl', { infer: true }),
        entities: [Player, Account],
        // The table itself is created by docker/postgres/init-postgres.sql,
        // not by TypeORM — a traditional migration-style schema instead of
        // Mongoose-style auto-sync, since joined tables (inventory, guilds,
        // ...) are expected to be added by hand later.
        synchronize: false,
        connectTimeoutMS: 2500,
        // Fail fast rather than retry-looping — make sure Postgres is up
        // (docker compose up -d game2d-postgres redis, from the repo root)
        // before starting this server.
        retryAttempts: 0,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
