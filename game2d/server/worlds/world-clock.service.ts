import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

// "Start of day" for a completely fresh world (nothing ever persisted) —
// solidly mid-morning, well clear of the dark-hours window (see
// shared/lighting.ts) rather than defaulting to midnight. A dev server
// restarts constantly (nest --watch), and GameGateway's worldHour used to
// reset to 0 every single time, which is functionally "every player joins
// at midnight" — this is what actually made the game look permanently
// dark to a fresh connection, not a lighting logic bug.
const FRESH_WORLD_STARTING_HOUR = 8;
const WORLD_HOUR_KEY = 'game2d:worldHour';

@Injectable()
export class WorldClockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Whatever hour the world was at the last time it ran — only a truly
  // fresh world (nothing ever persisted in Redis) starts at
  // FRESH_WORLD_STARTING_HOUR. Every subsequent restart resumes from here
  // instead of resetting to midnight, matching "the server should
  // maintain the day/night time."
  async getStartingHour(): Promise<number> {
    try {
      const stored = await this.redis.get(WORLD_HOUR_KEY);
      if (stored !== null) {
        const hour = Number(stored);
        if (Number.isInteger(hour) && hour >= 0 && hour < 24) return hour;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[world-clock] could not read persisted hour, defaulting to start-of-day:', message);
    }
    return FRESH_WORLD_STARTING_HOUR;
  }

  // Fire-and-forget — called once per globalStatTick, not worth ever
  // blocking the tick loop on.
  persistHour(hour: number): void {
    this.redis.set(WORLD_HOUR_KEY, String(hour)).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[world-clock] could not persist hour:', message);
    });
  }
}
