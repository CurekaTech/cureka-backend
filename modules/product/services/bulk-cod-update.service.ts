import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadType } from '../enums/bulk-upload-type.enum';
import { BULK_COD_UPDATE_HEADERS } from '../utils/bulk-cod-update-columns.util';
import { createCommerceSheetLock } from '../utils/commerce-sheet-lock.util';
import { CommerceSheetJobService } from './commerce-sheet-job.service';

export const bulkCodUpdateLock = createCommerceSheetLock(
  'locks:bulk-cod-update',
  'bulk-cod-update:cancel:',
);

@Injectable()
export class BulkCodUpdateService extends CommerceSheetJobService {
  constructor(
    storageService: StorageService,
    repository: BulkUploadsRepository,
    redisConnection: RedisConnectionService,
    configService: ConfigService,
    @InjectQueue('bulk-cod-update') queue: Queue,
  ) {
    super(storageService, repository, redisConnection, configService, queue, {
      uploadType: BulkUploadType.COD_UPDATE,
      lock: bulkCodUpdateLock,
      refPrefix: 'BCU',
      templateFileName: 'bulk-cod-update-template.xlsx',
      templateSheetName: 'COD Update',
      templateHeaders: BULK_COD_UPDATE_HEADERS,
      sampleRows: [
        ['HER/ZIN/08945', 'true'],
        ['HER/ZIN/08946', 'false'],
      ],
      storageFolder: 'bulk-cod-updates',
      defaultFilename: 'cod-update.xlsx',
      queueJobName: 'process-cod-sheet',
      logLabel: 'BULK_COD_UPDATE',
      conflictMessage: 'Another COD update is currently in progress. Please try again later.',
      missingFileMessage: 'No file uploaded. Send multipart/form-data with a "file" field.',
      queueFailureMessage: 'Failed to queue COD update',
      notFoundMessage: (refId) => `COD update job with refId "${refId}" not found`,
      cancelReason: 'COD update cancelled by administrator',
      cancelSuggestedFix: 'Upload a new file when ready.',
    });
  }
}
