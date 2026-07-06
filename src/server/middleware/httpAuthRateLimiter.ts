import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// Throttles /auth/register and /auth/login by IP to blunt credential-
// stuffing and registration-spam attempts against the HTTP surface.
export const httpAuthRateLimiter = rateLimit({
  windowMs: config.socketConnRateLimitWindowMs,
  limit: config.socketConnRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please wait a moment and try again.' },
});
