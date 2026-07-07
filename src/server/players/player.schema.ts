import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { ALL_RACES, type MapName, type Race } from '../../shared/constants.js';

export type PlayerDocument = HydratedDocument<Player>;

@Schema({ timestamps: true })
export class Player {
  @Prop({ required: true, unique: true, trim: true, minlength: 2, maxlength: 16 })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  // Chosen at registration — see RACES/Race — or reached by evolving (see
  // GameGateway.maybeEvolveToHobgoblin), which is why the enum here is
  // ALL_RACES (registration itself is still restricted to RACES, the
  // selectable subset — see registerCredentialsSchema). Defaults to
  // 'goblin' both for new documents and as a fallback for players created
  // before this field existed; those existing documents were also
  // backfilled directly (see the "Race" README section).
  @Prop({ required: true, enum: ALL_RACES, default: 'goblin' })
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

  // Starting stats for newly created characters. hp/mana/movement each cap
  // at their own max* below and regenerate passively on GameGateway's
  // per-connection stat tick (faster while resting, faster still while
  // sleeping).
  @Prop({ default: 100 })
  hp!: number;

  @Prop({ default: 100 })
  mana!: number;

  @Prop({ default: 100 })
  movement!: number;

  // Everyone starts at 100 — only permanently raised by evolving (see
  // GameGateway.maybeEvolveToHobgoblin), never by leveling up (a level-up
  // fully heals to the current max, it doesn't raise the max itself).
  @Prop({ default: 100 })
  maxHp!: number;

  @Prop({ default: 100 })
  maxMana!: number;

  @Prop({ default: 100 })
  maxMovement!: number;

  @Prop({ default: 0 })
  exp!: number;

  @Prop({ default: 1 })
  level!: number;

  // Permanent abilities, keyed by name with a 1-100 percentage value —
  // see players/skills.ts. Never removed once gained, only ever grows.
  @Prop({ type: Object, default: {} })
  skillLevels!: Record<string, number>;

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

  // Earned via "sacrifice" (manual or automatic — see autoSacrifice).
  @Prop({ default: 0 })
  gold!: number;

  // Toggled via "auto sac"/"auto sacrifice" — unlike restState (which
  // always resets to 'awake' on connect), this is a standing player
  // preference, so it persists across sessions.
  @Prop({ default: false })
  autoSacrifice!: boolean;

  // Toggled via "auto con"/"auto consume" — automatically consumes the
  // body part dropped by a kill (monster or player) instead of leaving it
  // on the ground. Same standing-preference persistence as autoSacrifice.
  @Prop({ default: false })
  autoConsume!: boolean;

  @Prop({ default: Date.now })
  lastLogin!: Date;
}

export const PlayerSchema = SchemaFactory.createForClass(Player);
