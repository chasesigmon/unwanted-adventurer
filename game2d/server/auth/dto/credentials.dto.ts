import { z } from 'zod';
import { RACES } from '../../../shared/constants.js';

const usernameLength = { min: 2, max: 16 } as const;

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.');

const accountUsernameSchema = z
  .string()
  .trim()
  .min(usernameLength.min, 'Username must be 2-16 characters.')
  .max(usernameLength.max, 'Username must be 2-16 characters.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores.');

// Login is account-only now — a character is chosen (or created)
// afterward, see characters.controller.ts.
export const credentialsSchema = z.object({
  username: accountUsernameSchema,
  password: passwordSchema,
});

// Registration creates an ACCOUNT — just email/username/password, no
// race and no character name. A character is created separately, after
// login, via POST /characters (see createCharacterSchema below).
export const registerAccountSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254, 'Email is too long.'),
  username: accountUsernameSchema,
  password: passwordSchema,
});

// A character's own display name — letters only, same shape the old
// registration's username used to require (this project's sprite/skill
// systems don't key off it being alphanumeric the way an account
// username can be).
export const createCharacterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(usernameLength.min, 'Character name must be 2-16 characters.')
    .max(usernameLength.max, 'Character name must be 2-16 characters.')
    .regex(/^[a-zA-Z]+$/, 'Character name may only contain letters.'),
  race: z.enum(RACES),
});

export type CredentialsDto = z.infer<typeof credentialsSchema>;
export type RegisterAccountDto = z.infer<typeof registerAccountSchema>;
export type CreateCharacterDto = z.infer<typeof createCharacterSchema>;
