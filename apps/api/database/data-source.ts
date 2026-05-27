import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: DATABASE_URL,
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development' ? ['query', 'error'] : ['error'],
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '..', '..', '..', 'modules', '**', 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  subscribers: [],
  // PgBouncer compatible settings
  extra: {
    statement_timeout: 30000,
    query_timeout: 30000,
  },
  poolSize: 5,
  connectTimeoutMS: 10000,
});
