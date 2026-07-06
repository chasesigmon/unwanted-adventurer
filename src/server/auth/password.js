import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// bcryptjs is a pure-JS, dependency-free implementation of the same bcrypt
// algorithm as the native `bcrypt` package — same hash format, same
// security properties, no native compilation step required to install it.
export function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, config.bcryptSaltRounds);
}

export function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}
