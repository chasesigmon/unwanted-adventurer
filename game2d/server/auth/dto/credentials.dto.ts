import { z } from 'zod';
import { RACES } from '../../../shared/constants.js';

const usernameLength = { min: 2, max: 16 } as const;

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.').max(128, 'Password is too long.');

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(usernameLength.min, 'Username must be 2-16 characters.')
    .max(usernameLength.max, 'Username must be 2-16 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores.'),
  password: passwordSchema,
});

// Registration additionally requires a race — either "goblin" or
// "skeleton", the only two this project has sprites for.
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
