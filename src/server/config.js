import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/text-arena',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
