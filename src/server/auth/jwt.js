import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signSessionToken({ username, sessionId }) {
  return jwt.sign({ username, sessionId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Throws if the token is malformed, expired, or signed with a different secret.
export function verifySessionToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
