import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { resolveDatabaseLogging } from '../config/database.config';

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const isMigrationCli = process.argv.some((arg) => /migration:(run|revert|show)/.test(arg));
const appQueryTimeoutMs = 30_000;
const migrationQueryTimeoutMs = Number(process.env['MIGRATION_QUERY_TIMEOUT_MS'] ?? 3_600_000);

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  synchronize: false,
  logging: resolveDatabaseLogging(),
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '..', '..', '..', 'modules', '**', 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  // Required so PostgreSQL enum additions commit before later migrations use the new value.
  migrationsTransactionMode: 'each',
  subscribers: [],
  // PgBouncer compatible settings
  extra: {
    statement_timeout: isMigrationCli ? migrationQueryTimeoutMs : appQueryTimeoutMs,
    query_timeout: isMigrationCli ? migrationQueryTimeoutMs : appQueryTimeoutMs,
  },
  poolSize: 5,
  connectTimeoutMS: 10000,
});
