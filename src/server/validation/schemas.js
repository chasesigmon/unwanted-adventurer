import { z } from 'zod';

// Same shape the username itself is already constrained to elsewhere; kept
// here too so auth payloads are rejected before they ever reach a DB query.
export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Username must be 2-16 characters.')
    .max(16, 'Username must be 2-16 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
});

// The command box only ever needs to carry a short token like "w" or "down".
export const commandSchema = z.string().trim().min(1).max(32);
