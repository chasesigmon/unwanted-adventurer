import { Module } from '@nestjs/common';
import { WorldManagerService } from './world-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';
import { WorldClockService } from './world-clock.service.js';
import { MonstersModule } from '../monsters/monsters.module.js';
import { PetManagerService } from '../pets/pet-manager.service.js';
import { AnimatedMonsterManagerService } from '../pets/animated-monster-manager.service.js';
import { PetCorpseManagerService } from '../pets/pet-corpse-manager.service.js';

@Module({
  imports: [MonstersModule],
  providers: [WorldManagerService, CorpseManagerService, WorldClockService, PetManagerService, AnimatedMonsterManagerService, PetCorpseManagerService],
  exports: [
    WorldManagerService,
    CorpseManagerService,
    WorldClockService,
    PetManagerService,
    AnimatedMonsterManagerService,
    PetCorpseManagerService,
    MonstersModule,
  ],
})
export class WorldsModule {}
