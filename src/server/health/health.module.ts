import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [RoomsModule],
  controllers: [HealthController],
})
export class HealthModule {}
