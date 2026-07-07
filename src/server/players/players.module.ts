import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Player, PlayerSchema } from './player.schema.js';
import { PlayersService } from './players.service.js';
import { DummyPlayerService } from './dummy-player.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Player.name, schema: PlayerSchema }])],
  providers: [PlayersService, DummyPlayerService],
  exports: [PlayersService, DummyPlayerService],
})
export class PlayersModule {}
