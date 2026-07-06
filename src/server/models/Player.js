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
    passwordHash: { type: String, required: true },
    map: { type: String, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PlayerModel = mongoose.model('Player', playerSchema);
