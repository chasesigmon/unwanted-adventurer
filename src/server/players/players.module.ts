import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Player, PlayerSchema } from './player.schema.js';
import { PlayersService } from './players.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Player.name, schema: PlayerSchema }])],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
