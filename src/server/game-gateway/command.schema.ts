import { z } from 'zod';

// The command box only ever needs to carry a short token like "w" or "down".
export const commandSchema = z.string().trim().min(1).max(32);
