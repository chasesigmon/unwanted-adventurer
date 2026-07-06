import Redis from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.warn('[redis] connection error:', err.message);
});
