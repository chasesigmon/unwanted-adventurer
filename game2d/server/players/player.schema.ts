import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { RACES, MAP_NAMES, STARTING_MAP, type MapName, type Race } from '../../shared/constants.js';

export type PlayerDocument = HydratedDocument<Player>;

// Deliberately minimal — just enough to place a character in the world
// and remember it between sessions. No stats/skills/equipment/inventory:
// none of that exists in this project (see the root project's own
// src/server/players/player.schema.ts for what a much larger version of
// this looks like, in the text game).
@Schema({ timestamps: true })
export class Player {
  @Prop({ required: true, unique: true, trim: true, minlength: 2, maxlength: 16 })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, enum: RACES, default: 'goblin' })
  race!: Race;

  @Prop({ required: true, enum: MAP_NAMES, default: STARTING_MAP })
  map!: MapName;

  @Prop({ required: true })
  row!: number;

  @Prop({ required: true })
  col!: number;

  @Prop({ default: Date.now })
  lastLogin!: Date;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
