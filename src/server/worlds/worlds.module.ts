import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorldManagerService } from './world-manager.service.js';

@Module({
  imports: [ConfigModule],
  providers: [WorldManagerService],
  exports: [WorldManagerService],
})
export class WorldsModule {}
