import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import type { MapName } from '../../shared/constants.js';

export interface PlayerAttrs {
  username: string;
  passwordHash: string;
  map: MapName;
  row: number;
  col: number;
  lastLogin: Date;
}

export type PlayerDocument = HydratedDocument<PlayerAttrs>;

const playerSchema = new Schema<PlayerAttrs>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 16,
    },
    passwordHash: { type: String, required: true },
    map: { type: String, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PlayerModel = mongoose.model<PlayerAttrs>('Player', playerSchema);
