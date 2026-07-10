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
import { mkdir, unlink, writeFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { CategoryFiltersRepository } from '@modules/master/repositories/category-filters.repository';
import {
  buildUnifiedBulkUploadHeaders,
  buildCategoryFilterColumnHeader,
} from '../utils/bulk-upload-columns.util';
import { AttributesRepository } from '@modules/master/repositories/attributes.repository';

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private static readonly TEMPLATE_FILE_NAME = 'bulk-upload-one-success-latest.xlsx';

  constructor(
    private readonly storageService: StorageService,
    private readonly repository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly attributesRepository: AttributesRepository,
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

  async getTemplateFile(): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const fileName = BulkUploadService.TEMPLATE_FILE_NAME;
    const fileBuffer = await this.buildTemplateBuffer();
    const templatePath = join(process.cwd(), 'docs', fileName);
    await writeFile(templatePath, fileBuffer);
    return { fileName, fileBuffer };
  }

  private async buildTemplateBuffer(): Promise<Buffer> {
    const activeFilters = await this.categoryFiltersRepository.findAllActiveOrderedByName();
    const categoryFilterHeaders = activeFilters.map((filter) =>
      buildCategoryFilterColumnHeader(filter.name),
    );
    const headers = buildUnifiedBulkUploadHeaders(categoryFilterHeaders);

    const workbook = new ExcelJS.Workbook();

    const activeAttributes = await this.attributesRepository.findAllPaginated({
      page: 1,
      limit: 5,
      sortBy: 'name',
      sortOrder: 'ASC',
    });
    const attributeOne = activeAttributes.data.find((item) => item.name === 'Color')?.name
      ?? activeAttributes.data[0]?.name
      ?? 'Color';
    const attributeTwo = activeAttributes.data.find((item) => item.name === 'Size')?.name
      ?? activeAttributes.data[1]?.name
      ?? 'Size';

    const importSheet = workbook.addWorksheet('Bulk Import Template');
    const headerRow = importSheet.addRow(headers);
    this.styleHeaderRow(headerRow);
    importSheet.views = [{ state: 'frozen', ySplit: 1 }];

    importSheet.addRow(this.buildSimpleSampleRow(headers));
    importSheet.addRow(
      this.buildVariableInlineSampleRow(headers, {
        attributeOne,
        attributeTwo,
        variantCount: 4,
      }),
    );

    const referenceSheet = workbook.addWorksheet('Category Filter Reference');
    referenceSheet.getCell('A1').value = 'Column Header';
    referenceSheet.getCell('B1').value = 'Filter Name';
    referenceSheet.getCell('C1').value = 'Allowed Values';
    this.styleHeaderRow(referenceSheet.getRow(1));

    let rowNumber = 2;
    for (const filter of activeFilters) {
      const row = referenceSheet.getRow(rowNumber);
      row.getCell(1).value = buildCategoryFilterColumnHeader(filter.name);
      row.getCell(2).value = filter.name;
      row.getCell(3).value = (filter.values ?? []).join(' | ');
      rowNumber++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private styleHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
  }

  private buildSimpleSampleRow(headers: string[]): Array<string | number | null> {
    const values = new Map<string, string | number | null>([
      ['Product Name*', 'Simple Demo Vitamin C 500mg'],
      ['Product Type *', 'simple'],
      ['Category *', 'Health & Wellness'],
      ['Brand*', 'Samsung'],
      ['Product SKU Code*', 'HEA/SAM/SMP-001'],
      ['MRP (Rs)*', 499],
      ['Selling Price (Rs)*', 399],
      ['Discount Percentage', 20],
      ['Quantity / Stock', 100],
      ['Weight (kg)', 0.15],
      ['Weight Unit', 'g'],
      ['Length (cm)', 10],
      ['Width (cm)', 5],
      ['Height (cm)', 5],
      ['Dimension Unit', 'cm'],
      ['Barcode (EAN/UPC)', '8901234567890'],
      ['HSN Code', '21069099'],
      ['Tax Class', 'GST 12%'],
      ['Product Description', 'Daily vitamin C supplement for immunity support.'],
      ['Product Highlights', 'High potency | Easy to swallow'],
      ['Product Status', 'active'],
      ['Variant Status', 'active'],
    ]);

    return headers.map((header) => values.get(header) ?? null);
  }

  private applyInlineVariantSlotValues(
    values: Map<string, string | number | null>,
    slot: number,
    options: {
      colorValue: string;
      sizeValue: string;
      mrp?: number;
      sellingPrice?: number;
      stock?: number;
      weight?: number;
      length?: number;
      width?: number;
      height?: number;
    },
  ): void {
    const {
      colorValue,
      sizeValue,
      mrp = 999,
      sellingPrice = 799,
      stock = 25,
      weight = 21,
      length = 10,
      width = 5,
      height = 5,
    } = options;
    values.set(`att_mrp_${slot}`, mrp);
    values.set(`att_selling_price_${slot}`, sellingPrice);
    values.set(`att_stock_${slot}`, stock);
    values.set(`att_weight_${slot}`, weight);
    values.set(`att_weight_unit_${slot}`, 'g');
    values.set(`att_length_${slot}`, length);
    values.set(`att_length_unit_${slot}`, 'cm');
    values.set(`att_width_${slot}`, width);
    values.set(`att_width_unit_${slot}`, 'cm');
    values.set(`att_height_${slot}`, height);
    values.set(`att_height_unit_${slot}`, 'cm');
    values.set(`att_discount_type_${slot}`, 'percentage');
    values.set(`att_discount_percentage_${slot}`, 20);
    values.set(`att_discount_value_${slot}`, 200);
    values.set(`att_attribute_1_value_${slot}`, colorValue);
    values.set(`att_attribute_2_value_${slot}`, sizeValue);
  }

  private buildVariableInlineSampleRow(
    headers: string[],
    options: {
      attributeOne: string;
      attributeTwo: string;
      variantCount?: number;
    },
  ): Array<string | number | null> {
    const variantCount = Math.min(Math.max(options.variantCount ?? 4, 1), 5);
    const values = new Map<string, string | number | null>([
      ['Product Name*', 'Variable Demo Multivitamin Serum'],
      ['Product Type *', 'variable'],
      ['Category *', 'Health & Wellness'],
      ['Brand*', 'Samsung'],
      ['Vendor SKU', 'VAR-INLINE-DEMO-001'],
      ['Attribute Details 1', options.attributeOne],
      ['Attribute Details 2', options.attributeTwo],
      ['Product Description', 'Variable product with inline variant slots — SKUs auto-generated.'],
      ['Product Status', 'active'],
    ]);

    const variantDefs = [
      { colorValue: 'Red', sizeValue: '100ml', mrp: 999, sellingPrice: 799, stock: 30, weight: 21, length: 10, width: 5, height: 5 },
      { colorValue: 'Blue', sizeValue: '100ml', mrp: 999, sellingPrice: 799, stock: 25, weight: 25, length: 12, width: 6, height: 6 },
      { colorValue: 'Green', sizeValue: '200ml', mrp: 1199, sellingPrice: 999, stock: 20, weight: 30, length: 14, width: 7, height: 7 },
      { colorValue: 'Black', sizeValue: '200ml', mrp: 1199, sellingPrice: 999, stock: 15, weight: 35, length: 16, width: 8, height: 8 },
      { colorValue: 'White', sizeValue: '100ml', mrp: 899, sellingPrice: 749, stock: 10, weight: 18, length: 9, width: 4, height: 4 },
    ];

    for (let slot = 1; slot <= variantCount; slot++) {
      this.applyInlineVariantSlotValues(values, slot, variantDefs[slot - 1]);
    }

    return headers.map((header) => values.get(header) ?? null);
  }

  async getJobStatus(refId: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record) {
      throw new NotFoundException(`Bulk upload job with refId "${refId}" not found`);
    }

    const rawSummary = Array.isArray(record.errorSummary) ? record.errorSummary : [];
    const uploadSummaryEntry = rawSummary.find(
      (item) => item?.column === '__upload_summary__',
    );
    const errorSummary = rawSummary.filter((item) => item?.column !== '__upload_summary__');
    const uploadSummary = uploadSummaryEntry
      ? JSON.parse(String(uploadSummaryEntry.invalidValue ?? '{}'))
      : undefined;

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
      uploadSummary,
      errorFileUrl: record.errorFileUrl,
      errorSummary,
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
