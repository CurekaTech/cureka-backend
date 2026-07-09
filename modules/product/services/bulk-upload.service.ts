import { BadRequestException, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { StorageService } from '@packages/storage';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisConnectionService } from '@packages/cache';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { generateUniqueRefId } from '@packages/common';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { join } from 'path';
import { mkdir, unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly repository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    @InjectQueue('bulk-upload') private readonly queue: Queue,
  ) {}

  async createBulkUploadJob(req: FastifyRequest, createdBy: string) {
    console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] START', {
      createdBy,
      isMultipart: req.isMultipart(),
    });

    // 1. Concurrency Check (Distributed Lock)
    const redis = await this.redisConnection.getConnectedClient();
    if (redis) {
      const lockKey = 'locks:bulk-upload';
      // Acquire distributed lock for 15 minutes (900,000 ms) using NX (set if not exists)
      const acquired = await redis.set(lockKey, 'locked', 'PX', 900000, 'NX');
      console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] REDIS_LOCK_ATTEMPT', {
        lockKey,
        acquired: Boolean(acquired),
      });
      if (!acquired) {
        throw new ConflictException('Another bulk upload is currently in progress. Please try again later.');
      }
    } else {
      // Fallback check against database status if Redis is down
      const activeCount = await this.repository.countActiveJobs();
      console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] REDIS_UNAVAILABLE_DB_ACTIVE_CHECK', {
        activeCount,
      });
      if (activeCount > 0) {
        throw new ConflictException('Another bulk upload is currently in progress. Please try again later.');
      }
    }

    if (!req.isMultipart()) {
      if (redis) {
        await redis.del('locks:bulk-upload');
      }
      throw new BadRequestException('Request must be multipart/form-data.');
    }

    const parts = req.parts();
    let fileUrl: string | null = null;
    let imagesZipUrl: string | null = null;

    try {
      for await (const part of parts) {
        const filePart = part as any;
        if (filePart.file) {
          console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] MULTIPART_FILE_PART', {
            fieldname: filePart.fieldname,
            filename: filePart.filename,
            mimetype: filePart.mimetype,
          });
          if (filePart.fieldname === 'file') {
            const allowedMimeTypes = [
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/csv',
            ];
            if (!allowedMimeTypes.includes(filePart.mimetype)) {
              filePart.file.resume();
              throw new BadRequestException('Invalid file type. Only Excel (.xlsx) and CSV (.csv) files are allowed.');
            }

            const uploadResult = await this.storageService.uploadImage({
              stream: filePart.file,
              mimetype: filePart.mimetype,
              originalFilename: filePart.filename,
              folder: 'bulk-uploads',
            });
            fileUrl = uploadResult.path;
            console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] SHEET_UPLOADED', {
              originalFilename: filePart.filename,
              mimetype: filePart.mimetype,
              fileUrl,
            });
          } else if (filePart.fieldname === 'imagesZip' || filePart.fieldname === 'images' || filePart.fieldname === 'zip') {
            const zipUploadResult = await this.storageService.uploadImage({
              stream: filePart.file,
              mimetype: filePart.mimetype,
              originalFilename: filePart.filename,
              folder: 'bulk-uploads',
            });
            imagesZipUrl = zipUploadResult.path;
            console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] IMAGES_ZIP_UPLOADED', {
              originalFilename: filePart.filename,
              mimetype: filePart.mimetype,
              imagesZipUrl,
            });
          } else {
            console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] IGNORED_FILE_FIELD', {
              fieldname: filePart.fieldname,
              filename: filePart.filename,
            });
            filePart.file.resume();
          }
        }
      }
    } catch (err) {
      console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] MULTIPART_ERROR', {
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      });
      if (redis) {
        await redis.del('locks:bulk-upload');
      }
      throw err;
    }

    if (!fileUrl) {
      if (redis) {
        await redis.del('locks:bulk-upload');
      }
      throw new BadRequestException('No file uploaded. Send multipart/form-data with a "file" field.');
    }

    const refId = await generateUniqueRefId('BUP', (candidate) =>
      this.repository.existsByRefId(candidate),
    );

    const record = await this.repository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      fileUrl,
      imagesZipUrl,
      totalRows: 0,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      errorSummary: [],
      createdBy,
    });
    console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] DB_RECORD_CREATED', {
      refId: record.refId,
      status: record.status,
      fileUrl: record.fileUrl,
      imagesZipUrl: record.imagesZipUrl,
      createdBy,
    });

    // 2. Queue background job
    try {
      await this.queue.add('process-sheet', {
        uploadRefId: record.refId,
        fileUrl: record.fileUrl,
        imagesZipUrl: record.imagesZipUrl || undefined,
      });
      console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] QUEUE_JOB_ADDED', {
        refId: record.refId,
        fileUrl: record.fileUrl,
        imagesZipUrl: record.imagesZipUrl,
      });
    } catch (queueError) {
      console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] QUEUE_JOB_FAILED', {
        refId: record.refId,
        error: queueError instanceof Error ? { name: queueError.name, message: queueError.message, stack: queueError.stack } : String(queueError),
      });
      // If queueing fails, mark DB record as failed and release lock
      await this.repository.updateFieldsByRefId(record.refId, {
        status: BulkUploadStatus.FAILED,
        errorSummary: [{ rowNumber: 0, sku: 'SYSTEM', column: 'Queue', invalidValue: 'N/A', reason: 'Failed to queue background job', suggestedFix: 'Contact system administrator.' }],
      });
      if (redis) {
        await redis.del('locks:bulk-upload');
      }
      throw new BadRequestException(`Failed to queue bulk upload task: ${queueError instanceof Error ? queueError.message : String(queueError)}`);
    }

    console.log('[BULK_UPLOAD_DEBUG][Service.createBulkUploadJob] RETURN_RESPONSE', {
      refId: record.refId,
      status: record.status,
      fileUrl: record.fileUrl,
    });
    return {
      refId: record.refId,
      status: record.status,
      fileUrl: record.fileUrl,
      imagesZipUrl: record.imagesZipUrl,
      createdAt: record.createdAt,
    };
  }

  async getJobStatus(refId: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record) {
      throw new NotFoundException(`Bulk upload job with refId "${refId}" not found`);
    }

    return {
      refId: record.refId,
      status: record.status,
      progress: {
        totalRows: record.totalRows,
        processedRows: record.processedRows,
        successfulRows: record.successfulRows,
        failedRows: record.failedRows,
        percentage: record.totalRows > 0 ? Math.round((record.processedRows / record.totalRows) * 100) : 0,
      },
      errorFileUrl: record.errorFileUrl,
      errorSummary: record.errorSummary,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }

  async getHistory(page = 1, limit = 20) {
    const [records, total] = await this.repository.findHistory(page, limit);
    return {
      data: records.map((record) => ({
        refId: record.refId,
        status: record.status,
        fileUrl: record.fileUrl,
        imagesZipUrl: record.imagesZipUrl,
        errorFileUrl: record.errorFileUrl,
        totalRows: record.totalRows,
        processedRows: record.processedRows,
        successfulRows: record.successfulRows,
        failedRows: record.failedRows,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
