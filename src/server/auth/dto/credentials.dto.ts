import { z } from 'zod';
import { RACES } from '../../../shared/constants.js';

const usernameLength = { min: 2, max: 16 } as const;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.');

// Login only needs to match an existing username, whatever characters it
// happens to contain — kept permissive so this never rejects an account
// created before (or under different rules than) the register schema
// below.
export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(usernameLength.min, 'Username must be 2-16 characters.')
    .max(usernameLength.max, 'Username must be 2-16 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores.'),
  password: passwordSchema,
});

// Registration is stricter: letters only. Nothing here changes casing —
// whatever the player typed is exactly what gets stored and displayed.
// Also requires a race, validated against the same RACES list the client's
// select and the Player schema's enum both read from.
export const registerCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(usernameLength.min, 'Username must be 2-16 characters.')
    .max(usernameLength.max, 'Username must be 2-16 characters.')
    .regex(/^[a-zA-Z]+$/, 'Username may only contain letters.'),
  password: passwordSchema,
  race: z.enum(RACES),
});

export type CredentialsDto = z.infer<typeof credentialsSchema>;
export type RegisterCredentialsDto = z.infer<typeof registerCredentialsSchema>;
