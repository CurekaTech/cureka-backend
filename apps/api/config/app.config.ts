import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const defaultLogLevel =
    nodeEnv === 'test' ? 'silent' : nodeEnv === 'development' ? 'debug' : 'info';

  return {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    nodeEnv,
    logLevel: process.env['LOG_LEVEL'] ?? defaultLogLevel,
    serviceName: process.env['LOG_SERVICE_NAME'] ?? 'cureka-backend',
    environment: process.env['APP_ENV'] ?? nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
    // Comma-separated list of allowed CORS origins. When absent, all origins are
    // reflected (safe for development; lock this down for staging/production).
    corsOrigins: process.env['CORS_ORIGINS'] ?? null,
  };
});
