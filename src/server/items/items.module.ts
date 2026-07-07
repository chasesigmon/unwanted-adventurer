import { Module } from '@nestjs/common';
import { ItemManagerService } from './item-manager.service.js';

@Module({
  providers: [ItemManagerService],
  exports: [ItemManagerService],
})
export class ItemsModule {}
