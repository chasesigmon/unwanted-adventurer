import { redis } from '../redis/client.js';
import { config } from '../config.js';

// Parses simple duration strings like "12h", "30m", "45s", or a bare number
// of seconds, matching what jsonwebtoken's `expiresIn` accepts, so the
// Redis session TTL always matches how long the JWT itself is valid.
function parseDurationToSeconds(duration) {
  if (typeof duration === 'number') return duration;
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(String(duration).trim());
  if (!match) return 12 * 60 * 60; // fallback: 12h
  const value = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

const SESSION_TTL_SECONDS = parseDurationToSeconds(config.jwtExpiresIn);

function sessionKey(username) {
  return `session:${username.toLowerCase()}`;
}

// Overwrites whatever session (if any) was previously active for this user,
// so an old JWT's sessionId will no longer match on its next use.
export async function setActiveSession(username, sessionId) {
  await redis.set(sessionKey(username), sessionId, 'EX', SESSION_TTL_SECONDS);
}

export async function getActiveSession(username) {
  return redis.get(sessionKey(username));
}

export async function clearActiveSession(username) {
  await redis.del(sessionKey(username));
}

export async function isSessionValid(username, sessionId) {
  const current = await getActiveSession(username);
  return current !== null && current === sessionId;
}
