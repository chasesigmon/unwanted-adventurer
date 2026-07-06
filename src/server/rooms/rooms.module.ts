import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RoomManagerService } from './room-manager.service.js';

@Module({
  imports: [ConfigModule],
  providers: [RoomManagerService],
  exports: [RoomManagerService],
})
export class RoomsModule {}
