export interface AppConfig {
  port: number;
  mongoUri: string;
  clientOrigin: string;
  redisUrl: string;

  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;

  heartbeatPingIntervalMs: number;
  heartbeatPingTimeoutMs: number;

  socketConnRateLimitMax: number;
  socketConnRateLimitWindowMs: number;

  commandRateLimitMax: number;
  commandRateLimitRefillPerSec: number;
}

// Factory consumed by ConfigModule.forRoot({ load: [configuration] }) — the
// single source of truth for env parsing, injected everywhere else via
// ConfigService instead of importing a config singleton directly. Mirrors
// the root project's src/server/config/configuration.ts, minus the fields
// that only make sense for the text game (world capacity, skeleton
// wander/respawn intervals — this project's own worlds are static, no
// wandering NPCs yet).
export default (): AppConfig => {
  if (!process.env.JWT_SECRET) {
    console.warn('[config] JWT_SECRET not set — using an insecure dev-only default. Set it in production.');
  }

  return {
    port: Number(process.env.PORT) || 3001,
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/game2d',
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5175',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

    jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-game2d',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

    heartbeatPingIntervalMs: Number(process.env.HEARTBEAT_PING_INTERVAL_MS) || 10000,
    heartbeatPingTimeoutMs: Number(process.env.HEARTBEAT_PING_TIMEOUT_MS) || 5000,

    socketConnRateLimitMax: Number(process.env.SOCKET_CONN_RATE_LIMIT_MAX) || 20,
    socketConnRateLimitWindowMs: Number(process.env.SOCKET_CONN_RATE_LIMIT_WINDOW_MS) || 60000,

    commandRateLimitMax: Number(process.env.COMMAND_RATE_LIMIT_MAX) || 10,
    commandRateLimitRefillPerSec: Number(process.env.COMMAND_RATE_LIMIT_REFILL_PER_SEC) || 10,
  };
};
