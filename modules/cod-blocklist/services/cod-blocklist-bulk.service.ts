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
import { BulkUploadsRepository } from '@modules/product/repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '@modules/product/enums/bulk-upload-status.enum';
import { BulkUploadType } from '@modules/product/enums/bulk-upload-type.enum';
import { COD_BLOCKLIST_BULK_HEADERS } from '../utils/cod-blocklist-bulk-columns.util';
import {
  COD_BLOCKLIST_BULK_LOCK_KEY,
  forceReleaseCodBlocklistBulkLock,
  markCodBlocklistBulkCancelled,
  releaseCodBlocklistBulkLock,
} from '../utils/cod-blocklist-bulk-lock.util';

@Injectable()
export class CodBlocklistBulkService {
  private readonly logger = new Logger(CodBlocklistBulkService.name);
  private static readonly TEMPLATE_FILE_NAME = 'cod-blocklist-bulk-upload-template.xlsx';

  constructor(
    private readonly storageService: StorageService,
    private readonly bulkUploadsRepository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly configService: ConfigService,
    @InjectQueue('cod-blocklist-bulk-upload') private readonly queue: Queue,
  ) {}

  async createJob(req: FastifyRequest, createdBy: string) {
    const redis = await this.redisConnection.getConnectedClient();
    const lockToken = randomUUID();
    const lockTtlMs = this.configService.get<number>(
      'COD_BLOCKLIST_BULK_LOCK_TTL_MS',
      1800000,
    );

    if (redis) {
      const acquired = await redis.set(
        COD_BLOCKLIST_BULK_LOCK_KEY,
        lockToken,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (!acquired) {
        throw new ConflictException(
          'Another COD blocklist bulk upload is currently in progress. Please try again later.',
        );
      }
    } else {
      const activeCount = await this.bulkUploadsRepository.countActiveJobs(
        BulkUploadType.COD_BLOCKLIST,
      );
      if (activeCount > 0) {
        throw new ConflictException(
          'Another COD blocklist bulk upload is currently in progress. Please try again later.',
        );
      }
    }

    if (!req.isMultipart()) {
      if (redis) await releaseCodBlocklistBulkLock(redis, lockToken);
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
          originalFilename: filePart.filename ?? 'cod-blocklist-bulk.xlsx',
          folder: 'cod-blocklist-bulk-uploads',
        });
        fileUrl = uploadResult.path;
      }
    } catch (err) {
      if (redis) await releaseCodBlocklistBulkLock(redis, lockToken);
      throw err;
    }

    if (!fileUrl) {
      if (redis) await releaseCodBlocklistBulkLock(redis, lockToken);
      throw new BadRequestException(
        'No file uploaded. Send multipart/form-data with a "file" field.',
      );
    }

    const refId = await generateUniqueRefId('CBU', (candidate) =>
      this.bulkUploadsRepository.existsByRefId(candidate),
    );

    const record = await this.bulkUploadsRepository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      uploadType: BulkUploadType.COD_BLOCKLIST,
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
      await this.queue.add('process-cod-blocklist-sheet', {
        uploadRefId: record.refId,
        fileUrl: record.fileUrl,
        createdBy,
        lockToken: redis ? lockToken : undefined,
        lockTtlMs,
      });
    } catch (queueError) {
      this.logger.error(
        {
          refId: record.refId,
          error: queueError instanceof Error ? queueError.message : String(queueError),
        },
        'Failed to queue COD blocklist bulk upload',
      );
      await this.bulkUploadsRepository.updateFieldsByRefId(record.refId, {
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
      if (redis) await releaseCodBlocklistBulkLock(redis, lockToken);
      throw new BadRequestException(
        `Failed to queue COD blocklist bulk upload: ${
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
    const sheet = workbook.addWorksheet('COD Blocklist');
    sheet.addRow([...COD_BLOCKLIST_BULK_HEADERS]);
    sheet.addRow(['560001', '', 'Yes', 'High RTO area']);
    sheet.addRow(['', '9876543210', 'No', 'Repeat COD refusal']);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = COD_BLOCKLIST_BULK_HEADERS.map((header) => ({
      header,
      width: Math.max(16, header.length + 4),
    }));

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      fileName: CodBlocklistBulkService.TEMPLATE_FILE_NAME,
      fileBuffer: Buffer.from(arrayBuffer),
    };
  }

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

  async getHistory(page = 1, limit = 20) {
    const [records, total] = await this.bulkUploadsRepository.findHistory(
      page,
      limit,
      BulkUploadType.COD_BLOCKLIST,
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
    const record = await this.bulkUploadsRepository.findByRefId(refId);
    if (!record || record.uploadType !== BulkUploadType.COD_BLOCKLIST) {
      throw new NotFoundException(`COD blocklist bulk upload job with refId "${refId}" not found`);
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
    const record = await this.bulkUploadsRepository.findByRefId(refId);
    if (!record || record.uploadType !== BulkUploadType.COD_BLOCKLIST) {
      throw new NotFoundException(`COD blocklist bulk upload job with refId "${refId}" not found`);
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
      await markCodBlocklistBulkCancelled(redis, refId);
      const lockReleased = await forceReleaseCodBlocklistBulkLock(redis);
      this.logger.warn(
        `[COD_BLOCKLIST_BULK] Cancel requested for ${refId} by ${cancelledBy}. Lock force-released=${lockReleased}`,
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
            `[COD_BLOCKLIST_BULK] Failed to remove ${state} queue job ${job.id} for ${refId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    await this.bulkUploadsRepository.updateFieldsByRefId(refId, {
      status: BulkUploadStatus.FAILED,
      completedAt: new Date(),
      errorSummary: [
        {
          rowNumber: 0,
          sku: 'SYSTEM',
          column: 'Cancel',
          invalidValue: cancelledBy,
          reason: 'COD blocklist bulk upload cancelled by administrator',
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
          ? 'COD blocklist bulk upload cancelled. Queue job removed.'
          : 'COD blocklist bulk upload cancelled. If processing continues, restart the API worker once.',
    };
  }
}
