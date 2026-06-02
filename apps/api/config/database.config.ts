import { registerAs } from '@nestjs/config';
import { DataSourceOptions, LoggerOptions } from 'typeorm';

/** Set DATABASE_LOGGING=false in .env to suppress SQL query logs in development. */
export function resolveDatabaseLogging(): LoggerOptions {
  const override = process.env['DATABASE_LOGGING'];
  if (override === 'false') return ['error'];
  if (override === 'true') return ['query', 'error'];
  return process.env['NODE_ENV'] === 'development' ? ['query', 'error'] : ['error'];
}

export const databaseConfig = registerAs('database', (): Partial<DataSourceOptions> => {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return {
    url,
    type: 'postgres',
    // PgBouncer compatibility: disable prepared statements in transaction pooling mode
    extra: {
      // Disable statement-level pooling prepared statements (PgBouncer transaction mode)
      statement_timeout: 30000,
      query_timeout: 30000,
    },
    // Connection pool settings — tuned for PgBouncer
    poolSize: 5,
    connectTimeoutMS: 10000,
    // Never use synchronize in production
    synchronize: false,
    logging: resolveDatabaseLogging(),
    ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
  };
});
