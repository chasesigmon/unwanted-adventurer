import { Module } from '@nestjs/common';
import { WorldManagerService } from './world-manager.service.js';
import { MonstersModule } from '../monsters/monsters.module.js';

@Module({
  imports: [MonstersModule],
  providers: [WorldManagerService],
  exports: [WorldManagerService, MonstersModule],
})
export class WorldsModule {}
