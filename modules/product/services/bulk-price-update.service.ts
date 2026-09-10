import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { generateUniqueRefId } from '@packages/common';
import { RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { BulkUploadType } from '../enums/bulk-upload-type.enum';
import { BULK_PRICE_UPDATE_HEADERS } from '../utils/bulk-price-update-columns.util';
import {
  BULK_PRICE_UPDATE_LOCK_KEY,
  forceReleaseBulkPriceUpdateLock,
  markBulkPriceUpdateCancelled,
  releaseBulkPriceUpdateLock,
} from '../utils/bulk-price-update-lock.util';

@Injectable()
export class BulkPriceUpdateService {
  private readonly logger = new Logger(BulkPriceUpdateService.name);
  private static readonly TEMPLATE_FILE_NAME = 'bulk-price-update-template.xlsx';

  constructor(
    private readonly storageService: StorageService,
    private readonly repository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly configService: ConfigService,
    @InjectQueue('bulk-price-update') private readonly queue: Queue,
  ) {}

  async createJob(req: FastifyRequest, createdBy: string) {
    const redis = await this.redisConnection.getConnectedClient();
    const lockToken = randomUUID();
    const lockTtlMs = this.configService.get<number>(
      'PRODUCT_BULK_PRICE_UPDATE_LOCK_TTL_MS',
      1800000,
    );

    if (redis) {
      const acquired = await redis.set(
        BULK_PRICE_UPDATE_LOCK_KEY,
        lockToken,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (!acquired) {
        throw new ConflictException(
          'Another bulk price update is currently in progress. Please try again later.',
        );
      }
    } else {
      const activeCount = await this.repository.countActiveJobs(BulkUploadType.PRICE_UPDATE);
      if (activeCount > 0) {
        throw new ConflictException(
          'Another bulk price update is currently in progress. Please try again later.',
        );
      }
    }

    if (!req.isMultipart()) {
      if (redis) await releaseBulkPriceUpdateLock(redis, lockToken);
      throw new BadRequestException('Request must be multipart/form-data.');
    }

    const maxSheetSize = this.configService.get<number>(
      'PRODUCT_BULK_UPLOAD_MAX_SHEET_SIZE',
      41943040,
    );

    let fileUrl: string | null = null;
    try {
      const parts = req.parts({ limits: { fileSize: maxSheetSize } });
      for await (const part of parts) {
        const filePart = part as {
          file?: NodeJS.ReadableStream;
          fieldname?: string;
          mimetype?: string;
          filename?: string;
        };
        if (!filePart.file) continue;
        if (filePart.fieldname !== 'file') {
          (filePart.file as { resume?: () => void }).resume?.();
          continue;
        }
        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'application/csv',
        ];
        if (!allowedMimeTypes.includes(filePart.mimetype ?? '')) {
          (filePart.file as { resume?: () => void }).resume?.();
          throw new BadRequestException(
            'Invalid file type. Only Excel (.xlsx) and CSV (.csv) files are allowed.',
          );
        }
        const uploadResult = await this.storageService.uploadImage({
          stream: filePart.file as any,
          mimetype: filePart.mimetype!,
          originalFilename: filePart.filename ?? 'price-update.xlsx',
          folder: 'bulk-price-updates',
        });
        fileUrl = uploadResult.path;
      }
    } catch (err) {
      if (redis) await releaseBulkPriceUpdateLock(redis, lockToken);
      throw err;
    }

    if (!fileUrl) {
      if (redis) await releaseBulkPriceUpdateLock(redis, lockToken);
      throw new BadRequestException(
        'No file uploaded. Send multipart/form-data with a "file" field.',
      );
    }

    const refId = await generateUniqueRefId('BPU', (candidate) =>
      this.repository.existsByRefId(candidate),
    );

    const record = await this.repository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      uploadType: BulkUploadType.PRICE_UPDATE,
      fileUrl,
      imagesZipUrl: null,
      totalRows: 0,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      errorSummary: [],
      createdBy,
    });

    try {
      await this.queue.add('process-price-sheet', {
        uploadRefId: record.refId,
        fileUrl: record.fileUrl,
        lockToken: redis ? lockToken : undefined,
        lockTtlMs,
      });
    } catch (queueError) {
      this.logger.error(
        {
          refId: record.refId,
          error: queueError instanceof Error ? queueError.message : String(queueError),
        },
        'Failed to queue bulk price update job',
      );
      await this.repository.updateFieldsByRefId(record.refId, {
        status: BulkUploadStatus.FAILED,
        errorSummary: [
          {
            rowNumber: 0,
            sku: 'SYSTEM',
            column: 'Queue',
            invalidValue: 'N/A',
            reason: 'Failed to queue background job',
            suggestedFix: 'Contact system administrator.',
          },
        ],
      });
      if (redis) await releaseBulkPriceUpdateLock(redis, lockToken);
      throw new BadRequestException(
        `Failed to queue bulk price update: ${
          queueError instanceof Error ? queueError.message : String(queueError)
        }`,
      );
    }

    return {
      refId: record.refId,
      status: record.status,
      uploadType: record.uploadType,
      fileUrl: record.fileUrl,
      createdAt: record.createdAt,
    };
  }

  async getTemplateFile(): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Price Update');
    sheet.addRow([...BULK_PRICE_UPDATE_HEADERS]);
    sheet.addRow(['ETH/HYD/54141-A1', '54141', 499, 399]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = BULK_PRICE_UPDATE_HEADERS.map((header) => ({
      header,
      width: Math.max(16, header.length + 4),
    }));

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      fileName: BulkPriceUpdateService.TEMPLATE_FILE_NAME,
      fileBuffer: Buffer.from(arrayBuffer),
    };
  }

  async getHistory(page = 1, limit = 20) {
    const [records, total] = await this.repository.findHistory(
      page,
      limit,
      BulkUploadType.PRICE_UPDATE,
    );
    return {
      data: records.map((record) => ({
        refId: record.refId,
        status: record.status,
        uploadType: record.uploadType,
        fileUrl: record.fileUrl,
        errorFileUrl: record.errorFileUrl,
        errorSummary: record.errorSummary,
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
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getJobStatus(refId: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record || record.uploadType !== BulkUploadType.PRICE_UPDATE) {
      throw new NotFoundException(`Bulk price update job with refId "${refId}" not found`);
    }

    const errorSummary = Array.isArray(record.errorSummary) ? record.errorSummary : [];

    return {
      refId: record.refId,
      status: record.status,
      uploadType: record.uploadType,
      progress: {
        totalRows: record.totalRows,
        processedRows: record.processedRows,
        successfulRows: record.successfulRows,
        failedRows: record.failedRows,
        percentage:
          record.totalRows > 0
            ? Math.round((record.processedRows / record.totalRows) * 100)
            : 0,
      },
      errorFileUrl: record.errorFileUrl,
      errorSummary,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }

  async cancelJob(refId: string, cancelledBy: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record || record.uploadType !== BulkUploadType.PRICE_UPDATE) {
      throw new NotFoundException(`Bulk price update job with refId "${refId}" not found`);
    }

    const terminalStatuses = new Set<BulkUploadStatus>([
      BulkUploadStatus.COMPLETED,
      BulkUploadStatus.FAILED,
      BulkUploadStatus.PARTIAL_SUCCESS,
    ]);
    if (terminalStatuses.has(record.status)) {
      return {
        refId: record.refId,
        status: record.status,
        cancelled: false,
        alreadyTerminal: true,
        message: `Job is already ${record.status}.`,
      };
    }

    const redis = await this.redisConnection.getConnectedClient();
    if (redis) {
      await markBulkPriceUpdateCancelled(redis, refId);
      const lockReleased = await forceReleaseBulkPriceUpdateLock(redis);
      this.logger.warn(
        `[BULK_PRICE_UPDATE] Cancel requested for ${refId} by ${cancelledBy}. Lock force-released=${lockReleased}`,
      );
    }

    let removedJobs = 0;
    const jobStates = ['active', 'waiting', 'delayed', 'paused'] as const;
    for (const state of jobStates) {
      const jobs = await this.queue.getJobs([state]);
      for (const job of jobs) {
        if (job.data?.uploadRefId !== refId) continue;
        try {
          await job.remove();
          removedJobs += 1;
        } catch (error) {
          this.logger.warn(
            `[BULK_PRICE_UPDATE] Failed to remove ${state} queue job ${job.id} for ${refId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    await this.repository.updateFieldsByRefId(refId, {
      status: BulkUploadStatus.FAILED,
      completedAt: new Date(),
      errorSummary: [
        {
          rowNumber: 0,
          sku: 'SYSTEM',
          column: 'Cancel',
          invalidValue: cancelledBy,
          reason: 'Bulk price update cancelled by administrator',
          suggestedFix: 'Upload a new file when ready.',
        },
      ],
    });

    return {
      refId,
      status: BulkUploadStatus.FAILED,
      cancelled: true,
      alreadyTerminal: false,
      removedJobs,
      message:
        removedJobs > 0
          ? 'Bulk price update cancelled. Queue job removed.'
          : 'Bulk price update cancelled. If processing continues, restart the API worker once.',
    };
  }

  /** Helper for controller template download typing. */
  sendTemplate(reply: FastifyReply, fileName: string, fileBuffer: Buffer) {
    return reply
      .code(200)
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(fileBuffer);
  }
}
