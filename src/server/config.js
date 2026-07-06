import dotenv from 'dotenv';
import { GRID_ROWS, GRID_COLS } from '../shared/constants.js';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/text-arena',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  gridRows: GRID_ROWS,
  gridCols: GRID_COLS,
};
