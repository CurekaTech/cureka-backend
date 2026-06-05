import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env['JWT_SECRET'],
  /** Default for admin tokens */
  expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
  /** Short-lived user access token */
  accessExpiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
  /** Long-lived refresh session (days) */
  refreshExpiresInDays: parseInt(process.env['JWT_REFRESH_EXPIRES_IN_DAYS'] ?? '90', 10),
}));
