import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Simple fixed-window counter per IP, checked before JWT verification on
// every Socket.io handshake, so a flood of connection attempts gets
// rejected cheaply instead of reaching auth/DB logic.
@Injectable()
export class SocketConnectionLimiterService {
  private readonly attemptsByIp = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly max: number;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.windowMs = configService.get('socketConnRateLimitWindowMs', { infer: true });
    this.max = configService.get('socketConnRateLimitMax', { infer: true });

    // Bounds memory growth from IPs that connect once and never again.
    setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of this.attemptsByIp) {
        if (now - entry.windowStart >= this.windowMs) {
          this.attemptsByIp.delete(ip);
        }
      }
    }, this.windowMs).unref();
  }

  isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.attemptsByIp.get(ip);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.attemptsByIp.set(ip, { count: 1, windowStart: now });
      return false;
    }

    entry.count += 1;
    return entry.count > this.max;
  }
}
