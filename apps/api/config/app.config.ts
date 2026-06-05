import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  isProduction: process.env['NODE_ENV'] === 'production',
  isDevelopment: process.env['NODE_ENV'] === 'development',
  // Comma-separated list of allowed CORS origins. When absent, all origins are
  // reflected (safe for development; lock this down for staging/production).
  corsOrigins: process.env['CORS_ORIGINS'] ?? null,
}));
