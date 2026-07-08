export interface CommandRateLimiterOptions {
  max: number;
  refillPerSec: number;
}

// One token bucket per connected socket, so a single client flooding the
// 'move' event can't monopolize the server even though each move is
// individually cheap to process. Not a Nest provider — the gateway creates
// one plain instance per connection, seeded with config values it already
// has.
export class CommandRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly max: number;
  private readonly refillPerSec: number;

  constructor({ max, refillPerSec }: CommandRateLimiterOptions) {
    this.max = max;
    this.refillPerSec = refillPerSec;
    this.tokens = max;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.max, this.tokens + elapsedSeconds * this.refillPerSec);
    this.lastRefill = now;

    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
