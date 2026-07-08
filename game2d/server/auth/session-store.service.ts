import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import type { AppConfig } from '../config/configuration.js';

type DurationUnit = 's' | 'm' | 'h' | 'd';
const DURATION_MULTIPLIERS: Record<DurationUnit, number> = { s: 1, m: 60, h: 3600, d: 86400 };

function parseDurationToSeconds(duration: string | number): number {
  if (typeof duration === 'number') return duration;
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(duration.trim());
  if (!match) return 12 * 60 * 60;
  const value = Number(match[1]);
  const unit = (match[2] as DurationUnit | undefined) ?? 's';
  return value * DURATION_MULTIPLIERS[unit];
}

// Keys are prefixed "game2d:" since this shares a Redis instance with the
// text game (see redis.module.ts) rather than needing its own container —
// the prefix is what keeps the two projects' sessions from colliding.
@Injectable()
export class SessionStoreService {
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    configService: ConfigService<AppConfig, true>
  ) {
    this.ttlSeconds = parseDurationToSeconds(configService.get('jwtExpiresIn', { infer: true }));
  }

  private key(username: string): string {
    return `game2d:session:${username.toLowerCase()}`;
  }

  async setActiveSession(username: string, sessionId: string): Promise<void> {
    await this.redis.set(this.key(username), sessionId, 'EX', this.ttlSeconds);
  }

  async getActiveSession(username: string): Promise<string | null> {
    return this.redis.get(this.key(username));
  }

  async clearActiveSession(username: string): Promise<void> {
    await this.redis.del(this.key(username));
  }

  async isSessionValid(username: string, sessionId: string): Promise<boolean> {
    const current = await this.getActiveSession(username);
    return current !== null && current === sessionId;
  }
}
