import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { unlink } from 'fs/promises';
import { RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { ICommerceSheetLock } from '../utils/commerce-sheet-lock.util';
import { downloadStoredFile } from '../utils/commerce-sheet-file.util';

export interface CommerceSheetJobData {
  uploadRefId: string;
  fileUrl: string;
  lockToken?: string;
  lockTtlMs?: number;
}

export async function runDownloadedSheetJob(input: {
  logPrefix: string;
  tempDirName: string;
  repository: BulkUploadsRepository;
  storageService: StorageService;
  redisConnection: RedisConnectionService;
  lock: ICommerceSheetLock;
  job: Job<CommerceSheetJobData>;
  logger: Logger;
  work: (tempFilePath: string, isCancelled: () => Promise<boolean>) => Promise<void>;
}): Promise<void> {
  const { uploadRefId, fileUrl, lockToken, lockTtlMs } = input.job.data;
  input.logger.log(`[${input.logPrefix}] Starting job ${uploadRefId}`);
  const redis = await input.redisConnection.getConnectedClient();
  let renewTimer: NodeJS.Timeout | null = null;
  let tempFilePath = '';

  try {
    await input.repository.updateFieldsByRefId(uploadRefId, {
      status: BulkUploadStatus.VALIDATING,
    });

    if (redis && lockToken && lockTtlMs) {
      const renewEveryMs = Math.max(30_000, Math.floor(lockTtlMs / 3));
      renewTimer = setInterval(() => {
        void input.lock.renew(redis, lockToken, lockTtlMs).catch((err) => {
          input.logger.warn(
            `[${input.logPrefix}] Failed to renew lock for ${uploadRefId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      }, renewEveryMs);
    }

    if (await input.lock.isCancelled(redis, uploadRefId)) {
      throw new Error(`${input.logPrefix} cancelled`);
    }

    tempFilePath = await downloadStoredFile(
      input.storageService,
      fileUrl,
      input.tempDirName,
      uploadRefId,
    );
    await input.work(tempFilePath, () => input.lock.isCancelled(redis, uploadRefId));
  } catch (error) {
    input.logger.error(
      `[${input.logPrefix}] Job ${uploadRefId} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await input.repository.updateFieldsByRefId(uploadRefId, {
      status: BulkUploadStatus.FAILED,
      completedAt: new Date(),
      errorSummary: [
        {
          rowNumber: 0,
          sku: 'SYSTEM',
          column: 'Processor',
          invalidValue: 'N/A',
          reason: error instanceof Error ? error.message : String(error),
          suggestedFix: 'Fix the file and re-upload',
        },
      ],
    });
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {
        // The downloaded sheet is only a staging file.
      }
    }
    if (redis && lockToken) {
      await input.lock.release(redis, lockToken);
    }
  }
}
