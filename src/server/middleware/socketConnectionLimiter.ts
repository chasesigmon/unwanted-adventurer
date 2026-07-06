import { config } from '../config.js';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Simple fixed-window counter per IP, checked before JWT verification on
// every Socket.io handshake, so a flood of connection attempts gets
// rejected cheaply instead of reaching auth/DB logic.
const attemptsByIp = new Map<string, RateLimitEntry>();

export function isConnectionRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);

  if (!entry || now - entry.windowStart >= config.socketConnRateLimitWindowMs) {
    attemptsByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > config.socketConnRateLimitMax;
}

// Bounds memory growth from IPs that connect once and never again.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attemptsByIp) {
    if (now - entry.windowStart >= config.socketConnRateLimitWindowMs) {
      attemptsByIp.delete(ip);
    }
  }
}, config.socketConnRateLimitWindowMs).unref();
