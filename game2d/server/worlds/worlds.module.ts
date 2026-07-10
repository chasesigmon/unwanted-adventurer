import { Module } from '@nestjs/common';
import { WorldManagerService } from './world-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';
import { WorldClockService } from './world-clock.service.js';
import { MonstersModule } from '../monsters/monsters.module.js';

@Module({
  imports: [MonstersModule],
  providers: [WorldManagerService, CorpseManagerService, WorldClockService],
  exports: [WorldManagerService, CorpseManagerService, WorldClockService, MonstersModule],
})
export class WorldsModule {}
