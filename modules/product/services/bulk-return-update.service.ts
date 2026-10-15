import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadType } from '../enums/bulk-upload-type.enum';
import { BULK_RETURN_UPDATE_HEADERS } from '../utils/bulk-return-update-columns.util';
import { createCommerceSheetLock } from '../utils/commerce-sheet-lock.util';
import { CommerceSheetJobService } from './commerce-sheet-job.service';

export const bulkReturnUpdateLock = createCommerceSheetLock(
  'locks:bulk-return-update',
  'bulk-return-update:cancel:',
);

@Injectable()
export class BulkReturnUpdateService extends CommerceSheetJobService {
  constructor(
    storageService: StorageService,
    repository: BulkUploadsRepository,
    redisConnection: RedisConnectionService,
    configService: ConfigService,
    @InjectQueue('bulk-return-update') queue: Queue,
  ) {
    super(storageService, repository, redisConnection, configService, queue, {
      uploadType: BulkUploadType.RETURN_UPDATE,
      lock: bulkReturnUpdateLock,
      refPrefix: 'BRU',
      templateFileName: 'bulk-return-update-template.xlsx',
      templateSheetName: 'Return Replacement Update',
      templateHeaders: BULK_RETURN_UPDATE_HEADERS,
      sampleRows: [
        ['HER/ZIN/08945', 'true', '7 day return', '7', 'true', '7', 'true'],
        ['HER/ZIN/08946', 'false', '', '', 'false', '', 'false'],
      ],
      storageFolder: 'bulk-return-updates',
      defaultFilename: 'return-update.xlsx',
      queueJobName: 'process-return-sheet',
      logLabel: 'BULK_RETURN_UPDATE',
      conflictMessage:
        'Another return and replacement update is currently in progress. Please try again later.',
      missingFileMessage: 'No file uploaded. Send multipart/form-data with a "file" field.',
      queueFailureMessage: 'Failed to queue return and replacement update',
      notFoundMessage: (refId) => `Return and replacement update job with refId "${refId}" not found`,
      cancelReason: 'Return and replacement update cancelled by administrator',
      cancelSuggestedFix: 'Upload a new file when ready.',
    });
  }
}
