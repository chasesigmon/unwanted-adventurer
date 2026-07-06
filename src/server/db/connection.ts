import mongoose from 'mongoose';
import { config } from '../config.js';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  try {
    // Fail fast into no-persistence mode instead of blocking startup for
    // mongoose's default 30s server-selection timeout when Mongo is down.
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2500 });
    console.log('[db] connected to MongoDB');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[db] could not connect to MongoDB, continuing without persistence:', message);
  }
}
