import { Module } from '@nestjs/common';
import { MonsterManagerService } from './monster-manager.service.js';

@Module({
  providers: [MonsterManagerService],
  exports: [MonsterManagerService],
})
export class MonstersModule {}
