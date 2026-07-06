import { config } from '../config.js';

// One token bucket per connected socket, so a single client flooding the
// 'command' event can't monopolize the server even though each command is
// individually cheap to process.
export class CommandRateLimiter {
  constructor() {
    this.tokens = config.commandRateLimitMax;
    this.lastRefill = Date.now();
  }

  tryConsume() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      config.commandRateLimitMax,
      this.tokens + elapsedSeconds * config.commandRateLimitRefillPerSec
    );
    this.lastRefill = now;

    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
