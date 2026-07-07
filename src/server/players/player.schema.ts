import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { MapName } from '../../shared/constants.js';

export type PlayerDocument = HydratedDocument<Player>;

@Schema({ timestamps: true })
export class Player {
  @Prop({ required: true, unique: true, trim: true, minlength: 2, maxlength: 16 })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true })
  map!: MapName;

  @Prop({ required: true })
  row!: number;

  @Prop({ required: true })
  col!: number;

  // Starting stats for newly created characters — plain numbers for now,
  // nothing yet consumes/regenerates them.
  @Prop({ default: 100 })
  hp!: number;

  @Prop({ default: 100 })
  mana!: number;

  @Prop({ default: 100 })
  movement!: number;

  @Prop({ default: 0 })
  exp!: number;

  @Prop({ default: Date.now })
  lastLogin!: Date;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
