import { createHash, randomBytes } from 'crypto';

export const generateRefreshToken = (): string => randomBytes(32).toString('hex');

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
