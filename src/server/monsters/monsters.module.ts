import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MonsterManagerService } from './monster-manager.service.js';

@Module({
  imports: [ConfigModule],
  providers: [MonsterManagerService],
  exports: [MonsterManagerService],
})
export class MonstersModule {}
