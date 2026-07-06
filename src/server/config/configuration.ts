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

  worldCapacity: number;

  skeletonWanderIntervalMs: number;
  skeletonRespawnIntervalMs: number;
}

// Factory consumed by ConfigModule.forRoot({ load: [configuration] }) — the
// single source of truth for env parsing, injected everywhere else via
// ConfigService instead of importing a config singleton directly.
export default (): AppConfig => {
  if (!process.env.JWT_SECRET) {
    console.warn('[config] JWT_SECRET not set — using an insecure dev-only default. Set it in production.');
  }

  return {
    port: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/text-arena',
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

    jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

    heartbeatPingIntervalMs: Number(process.env.HEARTBEAT_PING_INTERVAL_MS) || 10000,
    heartbeatPingTimeoutMs: Number(process.env.HEARTBEAT_PING_TIMEOUT_MS) || 5000,

    socketConnRateLimitMax: Number(process.env.SOCKET_CONN_RATE_LIMIT_MAX) || 20,
    socketConnRateLimitWindowMs: Number(process.env.SOCKET_CONN_RATE_LIMIT_WINDOW_MS) || 60000,

    commandRateLimitMax: Number(process.env.COMMAND_RATE_LIMIT_MAX) || 10,
    commandRateLimitRefillPerSec: Number(process.env.COMMAND_RATE_LIMIT_REFILL_PER_SEC) || 10,

    worldCapacity: Number(process.env.WORLD_CAPACITY) || 50,

    skeletonWanderIntervalMs: Number(process.env.SKELETON_WANDER_INTERVAL_MS) || 3000,
    skeletonRespawnIntervalMs: Number(process.env.SKELETON_RESPAWN_INTERVAL_MS) || 60000,
  };
};
