import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 16,
    },
    color: { type: Number, default: 0x00ff88 },
    score: { type: Number, default: 0 },
    x: { type: Number, default: 1000 },
    y: { type: Number, default: 1000 },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PlayerModel = mongoose.model('Player', playerSchema);
