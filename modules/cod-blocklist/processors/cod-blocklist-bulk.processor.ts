import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '@modules/product/repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '@modules/product/enums/bulk-upload-status.enum';
import {
  CodBlocklistBulkParserService,
  ICodBulkRowError,
} from '../services/cod-blocklist-bulk-parser.service';
import { CodBlocklistService } from '../services/cod-blocklist.service';
import {
  isCodBlocklistBulkCancelled,
  releaseCodBlocklistBulkLock,
  renewCodBlocklistBulkLock,
} from '../utils/cod-blocklist-bulk-lock.util';

interface CodBlocklistBulkJobData {
  uploadRefId: string;
  fileUrl: string;
  createdBy: string;
  lockToken?: string;
  lockTtlMs?: number;
}

@Processor('cod-blocklist-bulk-upload', { concurrency: 1 })
export class CodBlocklistBulkProcessor extends WorkerHost {
  private readonly logger = new Logger(CodBlocklistBulkProcessor.name);

  constructor(
    private readonly bulkUploadsRepository: BulkUploadsRepository,
    private readonly parser: CodBlocklistBulkParserService,
    private readonly codBlocklistService: CodBlocklistService,
    private readonly storageService: StorageService,
    private readonly redisConnection: RedisConnectionService,
  ) {
    super();
  }

  async process(job: Job<CodBlocklistBulkJobData>): Promise<void> {
    const { uploadRefId, fileUrl, createdBy, lockToken, lockTtlMs } = job.data;
    this.logger.log(`[COD_BLOCKLIST_BULK] Starting job ${uploadRefId}`);

    const redis = await this.redisConnection.getConnectedClient();
    let renewTimer: NodeJS.Timeout | null = null;
    const tempDir = join(process.cwd(), 'tmp', 'cod-blocklist-bulk-uploads');
    const tempFilePath = join(tempDir, `${uploadRefId}-${Date.now()}`);

    try {
      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.VALIDATING,
      });

      if (redis && lockToken && lockTtlMs) {
        const renewEveryMs = Math.max(30_000, Math.floor(lockTtlMs / 3));
        renewTimer = setInterval(() => {
          void renewCodBlocklistBulkLock(redis, lockToken, lockTtlMs).catch((err) => {
            this.logger.warn(
              `[COD_BLOCKLIST_BULK] Failed to renew lock for ${uploadRefId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        }, renewEveryMs);
      }

      if (await isCodBlocklistBulkCancelled(redis, uploadRefId)) {
        throw new Error('COD blocklist bulk upload cancelled');
      }

      await mkdir(tempDir, { recursive: true });
      const readStream = await this.storageService.createReadStream(fileUrl);
      await pipeline(readStream, createWriteStream(tempFilePath));

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.PROCESSING,
      });

      const { rows, errors } = await this.parser.parseFile(tempFilePath);
      const allErrors: ICodBulkRowError[] = [...errors];
      let successfulRows = 0;
      let processedRows = errors.length;

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        totalRows: rows.length + errors.length,
        processedRows,
        successfulRows: 0,
        failedRows: errors.length,
        errorSummary: allErrors,
      });

      for (const row of rows) {
        if (await isCodBlocklistBulkCancelled(redis, uploadRefId)) {
          throw new Error('COD blocklist bulk upload cancelled');
        }
        processedRows += 1;
        const identity = row.pincode || row.mobileNumber || '';
        try {
          await this.codBlocklistService.upsertFromBulk({
            pincode: row.pincode,
            mobileNumber: row.mobileNumber,
            isActive: row.isActive,
            reason: row.reason ?? null,
            actorEmail: createdBy,
          });
          successfulRows += 1;
        } catch (rowError) {
          const message =
            rowError instanceof HttpException
              ? this.extractHttpMessage(rowError)
              : rowError instanceof Error
                ? rowError.message
                : String(rowError);
          allErrors.push({
            rowNumber: row.rowNumber,
            sku: identity,
            column: 'SYSTEM',
            invalidValue: identity,
            reason: message,
            suggestedFix: 'Fix the row values and re-upload',
          });
        }

        if (processedRows % 25 === 0 || processedRows === rows.length + errors.length) {
          await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
            processedRows,
            successfulRows,
            failedRows: allErrors.length,
            errorSummary: allErrors.slice(0, 500),
          });
        }
      }

      const failedRows = allErrors.length;
      const totalRows = successfulRows + failedRows;
      let status = BulkUploadStatus.COMPLETED;
      if (successfulRows === 0 && failedRows > 0) status = BulkUploadStatus.FAILED;
      else if (successfulRows > 0 && failedRows > 0) status = BulkUploadStatus.PARTIAL_SUCCESS;

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status,
        totalRows,
        processedRows: totalRows,
        successfulRows,
        failedRows,
        errorSummary: allErrors.slice(0, 1000),
        completedAt: new Date(),
      });
      this.logger.log(
        `[COD_BLOCKLIST_BULK] Finished ${uploadRefId} status=${status} ok=${successfulRows} fail=${failedRows}`,
      );
    } catch (error) {
      this.logger.error(
        `[COD_BLOCKLIST_BULK] Job ${uploadRefId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
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
      try {
        await unlink(tempFilePath);
      } catch {
        // ignore
      }
      if (redis && lockToken) {
        await releaseCodBlocklistBulkLock(redis, lockToken);
      }
    }
  }

  private extractHttpMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const body = response as { message?: string | string[]; code?: string };
      if (Array.isArray(body.message)) return body.message.join('; ');
      if (typeof body.message === 'string') return body.message;
      if (body.code) return String(body.code);
    }
    return error.message;
  }
}
