import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { MonstersModule } from '../monsters/monsters.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [WorldsModule, MonstersModule],
  controllers: [HealthController],
})
export class HealthModule {}
