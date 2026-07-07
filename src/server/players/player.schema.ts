import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { RACES, type MapName, type Race } from '../../shared/constants.js';

export type PlayerDocument = HydratedDocument<Player>;

@Schema({ timestamps: true })
export class Player {
  @Prop({ required: true, unique: true, trim: true, minlength: 2, maxlength: 16 })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  // Chosen at registration — see RACES/Race. Defaults to 'goblin' (the
  // only option so far) both for new documents and as a fallback for
  // players created before this field existed; those existing documents
  // were also backfilled directly (see the "Race" README section).
  @Prop({ required: true, enum: RACES, default: 'goblin' })
  race!: Race;

  @Prop({ required: true })
  map!: MapName;

  @Prop({ required: true })
  row!: number;

  @Prop({ required: true })
  col!: number;

  // Base attributes — everyone starts at 1, no allocation/leveling
  // mechanic yet to change them.
  @Prop({ default: 1 })
  strength!: number;

  @Prop({ default: 1 })
  intelligence!: number;

  @Prop({ default: 1 })
  wisdom!: number;

  @Prop({ default: 1 })
  dexterity!: number;

  @Prop({ default: 1 })
  constitution!: number;

  // Starting stats for newly created characters. hp/mana/movement all cap
  // at 100 and regenerate passively on GameGateway's per-connection stat
  // tick (faster while resting, faster still while sleeping).
  @Prop({ default: 100 })
  hp!: number;

  @Prop({ default: 100 })
  mana!: number;

  @Prop({ default: 100 })
  movement!: number;

  @Prop({ default: 0 })
  exp!: number;

  @Prop({ default: 1 })
  level!: number;

  // Permanent abilities gained via "consume <item>" — see
  // players/skills.ts. Never removed once gained.
  @Prop({ type: [String], default: [] })
  skills!: string[];

  // Items picked up via "grab"/"get <item>" — see items/item-manager.service.ts.
  @Prop({ type: [String], default: [] })
  inventory!: string[];

  // Keyed by EquipmentSlot (see items/item-definitions.ts) — only
  // occupied slots are present, so this starts empty rather than
  // pre-populated with nulls. Populated via "equip <item>", which moves
  // the item out of `inventory` into here.
  @Prop({ type: Object, default: {} })
  equipment!: Record<string, string>;

  // Separate from `exp`/leveling — tracks how many body parts have been
  // consumed, regardless of whether the skill roll succeeded.
  @Prop({ default: 0 })
  consumeExp!: number;

  @Prop({ default: Date.now })
  lastLogin!: Date;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
