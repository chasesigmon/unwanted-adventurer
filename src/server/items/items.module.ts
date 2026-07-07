import { Module } from '@nestjs/common';
import { ItemManagerService } from './item-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';

@Module({
  providers: [ItemManagerService, CorpseManagerService],
  exports: [ItemManagerService, CorpseManagerService],
})
export class ItemsModule {}
