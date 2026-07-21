/**
 * Cancel a stuck bulk upload job (DB + Redis lock + BullMQ queue).
 *
 * Usage:
 *   npm run bulk-upload:cancel -- BUP2026006360
 *   npm run bulk-upload:cancel -- --ref-id=BUP2026006360
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AppDataSource } from '../data-source';
import { BulkUploadEntity } from '../../../../modules/product/entities/bulk-upload.entity';
import { BulkUploadStatus } from '../../../../modules/product/enums/bulk-upload-status.enum';
import { buildRedisClientOptions } from '../../../../packages/cache/src/redis-options.util';
import {
  forceReleaseBulkUploadLock,
  markBulkUploadCancelled,
} from '../../../../modules/product/utils/bulk-upload-cancel.util';

dotenv.config();

const parseRefId = (argv: string[]): string | null => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--ref-id=')) {
      return arg.slice('--ref-id='.length).trim() || null;
    }
    if (arg === '--ref-id') {
      return argv[index + 1]?.trim() || null;
    }
    if (arg.startsWith('BUP')) {
      return arg.trim();
    }
  }
  return null;
};

const createRedisClient = (): Redis => {
  const host = process.env['REDIS_HOST'] || 'localhost';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  const password = process.env['REDIS_PASSWORD'] || undefined;
  const username = process.env['REDIS_USERNAME'] || undefined;
  const tls = process.env['REDIS_TLS'] === 'true';

  return new Redis(
    buildRedisClientOptions({
      host,
      port,
      password,
      username,
      tls,
      lazyConnect: true,
      enableOfflineQueue: false,
    }),
  );
};

async function run(): Promise<void> {
  const refId = parseRefId(process.argv.slice(2));
  if (!refId) {
    console.error('Usage: npm run bulk-upload:cancel -- BUP2026006360');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(BulkUploadEntity);
  const record = await repo.findOne({ where: { refId } });
  if (!record) {
    console.error(`[bulk-upload:cancel] Job not found: ${refId}`);
    process.exit(1);
  }

  console.log(`[bulk-upload:cancel] Current status for ${refId}: ${record.status}`);

  const terminalStatuses = new Set<string>([
    BulkUploadStatus.COMPLETED,
    BulkUploadStatus.FAILED,
    BulkUploadStatus.PARTIAL_SUCCESS,
  ]);
  if (terminalStatuses.has(record.status)) {
    console.log(`[bulk-upload:cancel] Job already terminal (${record.status}). Nothing to do.`);
    await AppDataSource.destroy();
    return;
  }

  const redis = createRedisClient();
  await redis.connect();
  await markBulkUploadCancelled(redis, refId);
  const lockReleased = await forceReleaseBulkUploadLock(redis);
  console.log(`[bulk-upload:cancel] Redis cancel flag set. Lock force-released=${lockReleased}`);

  const queue = new Queue('bulk-upload', {
    connection: {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      username: process.env['REDIS_USERNAME'] || undefined,
      password: process.env['REDIS_PASSWORD'] || undefined,
      tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
    },
  });

  let removedJobs = 0;
  for (const state of ['active', 'waiting', 'delayed', 'paused'] as const) {
    const jobs = await queue.getJobs([state]);
    for (const job of jobs) {
      if (job.data?.uploadRefId !== refId) {
        continue;
      }
      try {
        await job.remove();
        removedJobs += 1;
        console.log(`[bulk-upload:cancel] Removed ${state} queue job id=${job.id}`);
      } catch (error) {
        console.warn(
          `[bulk-upload:cancel] Could not remove ${state} job id=${job.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  record.status = BulkUploadStatus.FAILED;
  record.completedAt = new Date();
  record.errorSummary = [
    {
      rowNumber: 0,
      sku: 'SYSTEM',
      column: 'Cancel',
      invalidValue: 'bulk-upload:cancel script',
      reason: 'Bulk upload cancelled by administrator',
      suggestedFix: 'Upload a new file when ready.',
    },
  ];
  await repo.save(record);

  await queue.close();
  await redis.quit();
  await AppDataSource.destroy();

  console.log(
    `[bulk-upload:cancel] Done. ${refId} marked failed. Removed queue jobs=${removedJobs}.`,
  );
  if (removedJobs === 0) {
    console.log(
      '[bulk-upload:cancel] No queue job removed — if the worker is still busy, restart the API process once.',
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[bulk-upload:cancel] failed:', error);
    process.exit(1);
  });
