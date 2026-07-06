import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export interface SessionTokenPayload {
  username: string;
  sessionId: string;
}

export function signSessionToken({ username, sessionId }: SessionTokenPayload): string {
  // jsonwebtoken types `expiresIn` as a branded string literal (via `ms`),
  // but ours comes from an env var — we validate its shape ourselves in
  // sessionStore.ts's parseDurationToSeconds, so the cast is safe here.
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ username, sessionId }, config.jwtSecret, options);
}

// Throws if the token is malformed, expired, or signed with a different
// secret. The cast is safe on the success path — we control both signing
// and verifying, so a token that verifies always carries this shape.
export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, config.jwtSecret) as SessionTokenPayload;
}
