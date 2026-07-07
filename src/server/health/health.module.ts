import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { MonstersModule } from '../monsters/monsters.module.js';
import { ItemsModule } from '../items/items.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [WorldsModule, MonstersModule, ItemsModule],
  controllers: [HealthController],
})
export class HealthModule {}
