import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [WorldsModule],
  controllers: [HealthController],
})
export class HealthModule {}
