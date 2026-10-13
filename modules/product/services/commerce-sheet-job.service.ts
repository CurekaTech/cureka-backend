import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { ICommerceSheetLock } from '../utils/commerce-sheet-lock.util';

export interface ICommerceSheetJobOptions {
  uploadType: BulkUploadType;
  lock: ICommerceSheetLock;
  refPrefix: string;
  templateFileName: string;
  templateSheetName: string;
  templateHeaders: readonly string[];
  sampleRows: string[][];
  storageFolder: string;
  defaultFilename: string;
  queueJobName: string;
  logLabel: string;
  conflictMessage: string;
  missingFileMessage: string;
  queueFailureMessage: string;
  notFoundMessage: (refId: string) => string;
  cancelReason: string;
  cancelSuggestedFix: string;
}

export class CommerceSheetJobService {
  private readonly logger: Logger;

  constructor(
    private readonly storageService: StorageService,
    private readonly repository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly configService: ConfigService,
    private readonly queue: Queue,
    private readonly options: ICommerceSheetJobOptions,
  ) {
    this.logger = new Logger(options.logLabel);
  }

  async createJob(req: FastifyRequest, createdBy: string) {
    const redis = await this.redisConnection.getConnectedClient();
    const lockToken = randomUUID();
    const lockTtlMs = this.configService.get<number>(
      'PRODUCT_BULK_UPLOAD_LOCK_TTL_MS',
      1800000,
    );
    const { lock, options } = { lock: this.options.lock, options: this.options };

    if (redis) {
      const acquired = await redis.set(lock.lockKey, lockToken, 'PX', lockTtlMs, 'NX');
      if (!acquired) throw new ConflictException(options.conflictMessage);
    } else {
      const activeCount = await this.repository.countActiveJobs(options.uploadType);
      if (activeCount > 0) throw new ConflictException(options.conflictMessage);
    }

    if (!req.isMultipart()) {
      if (redis) await lock.release(redis, lockToken);
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
          originalFilename: filePart.filename ?? options.defaultFilename,
          folder: options.storageFolder,
        });
        fileUrl = uploadResult.path;
      }
    } catch (err) {
      if (redis) await lock.release(redis, lockToken);
      throw err;
    }

    if (!fileUrl) {
      if (redis) await lock.release(redis, lockToken);
      throw new BadRequestException(options.missingFileMessage);
    }

    const refId = await generateUniqueRefId(options.refPrefix, (candidate) =>
      this.repository.existsByRefId(candidate),
    );
    const record = await this.repository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      uploadType: options.uploadType,
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
      await this.queue.add(options.queueJobName, {
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
        `Failed to queue ${options.logLabel}`,
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
      if (redis) await lock.release(redis, lockToken);
      throw new BadRequestException(
        `${options.queueFailureMessage}: ${
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
    const sheet = workbook.addWorksheet(this.options.templateSheetName);
    sheet.addRow([...this.options.templateHeaders]);
    for (const sample of this.options.sampleRows) sheet.addRow(sample);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = this.options.templateHeaders.map((header) => ({
      header,
      width: Math.max(18, header.length + 4),
    }));
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      fileName: this.options.templateFileName,
      fileBuffer: Buffer.from(arrayBuffer),
    };
  }

  async getHistory(page = 1, limit = 20) {
    const [records, total] = await this.repository.findHistory(page, limit, this.options.uploadType);
    return {
      data: records.map((record) => this.toJobView(record)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getJobStatus(refId: string) {
    const record = await this.requireJob(refId);
    const view = this.toJobView(record);
    return {
      refId: view.refId,
      status: view.status,
      uploadType: view.uploadType,
      progress: {
        totalRows: view.totalRows,
        processedRows: view.processedRows,
        successfulRows: view.successfulRows,
        failedRows: view.failedRows,
        percentage:
          view.totalRows > 0 ? Math.round((view.processedRows / view.totalRows) * 100) : 0,
      },
      summary: view.summary,
      errorFileUrl: view.errorFileUrl,
      errorSummary: view.errorSummary,
      createdAt: view.createdAt,
      completedAt: view.completedAt,
    };
  }

  async cancelJob(refId: string, cancelledBy: string) {
    const record = await this.requireJob(refId);
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
      await this.options.lock.markCancelled(redis, refId);
      const lockReleased = await this.options.lock.forceRelease(redis);
      this.logger.warn(
        `[${this.options.logLabel}] Cancel requested for ${refId} by ${cancelledBy}. Lock force-released=${lockReleased}`,
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
            `[${this.options.logLabel}] Failed to remove ${state} queue job ${job.id} for ${refId}: ${
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
          reason: this.options.cancelReason,
          suggestedFix: this.options.cancelSuggestedFix,
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
          ? `${this.options.logLabel} cancelled. Queue job removed.`
          : `${this.options.logLabel} cancelled. If processing continues, restart the API worker once.`,
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

  private async requireJob(refId: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record || record.uploadType !== this.options.uploadType) {
      throw new NotFoundException(this.options.notFoundMessage(refId));
    }
    return record;
  }

  private toJobView(record: {
    refId: string;
    status: BulkUploadStatus;
    uploadType: BulkUploadType;
    fileUrl: string | null;
    errorFileUrl: string | null;
    errorSummary: unknown;
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    const raw = Array.isArray(record.errorSummary) ? record.errorSummary : [];
    const summary =
      raw.find((entry) => entry && typeof entry === 'object' && entry.type === 'jobSummary') ??
      null;
    const errorSummary = raw.filter(
      (entry) => !entry || typeof entry !== 'object' || entry.type !== 'jobSummary',
    );
    return {
      refId: record.refId,
      status: record.status,
      uploadType: record.uploadType,
      fileUrl: record.fileUrl,
      errorFileUrl: record.errorFileUrl,
      summary,
      errorSummary,
      totalRows: record.totalRows,
      processedRows: record.processedRows,
      successfulRows: record.successfulRows,
      failedRows: record.failedRows,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }
}
