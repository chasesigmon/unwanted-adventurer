import { Module } from '@nestjs/common';
import { WorldManagerService } from './world-manager.service.js';

@Module({
  providers: [WorldManagerService],
  exports: [WorldManagerService],
})
export class WorldsModule {}
