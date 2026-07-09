import { Module } from '@nestjs/common';
import { WorldManagerService } from './world-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';
import { MonstersModule } from '../monsters/monsters.module.js';

@Module({
  imports: [MonstersModule],
  providers: [WorldManagerService, CorpseManagerService],
  exports: [WorldManagerService, CorpseManagerService, MonstersModule],
})
export class WorldsModule {}
