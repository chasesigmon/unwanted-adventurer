import dotenv from 'dotenv';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  ORB_RADIUS,
  ORB_VALUE,
  ORB_COUNT,
  TICK_RATE,
  SNAPSHOT_RATE,
} from '../shared/constants.js';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/text-arena',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  tickRate: Number(process.env.TICK_RATE) || TICK_RATE,
  snapshotRate: Number(process.env.SNAPSHOT_RATE) || SNAPSHOT_RATE,

  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  playerRadius: PLAYER_RADIUS,
  playerSpeed: PLAYER_SPEED,
  orbRadius: ORB_RADIUS,
  orbValue: ORB_VALUE,
  orbCount: ORB_COUNT,
};
