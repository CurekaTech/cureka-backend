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
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { WellnessGoalsRepository } from '@modules/master/repositories/wellness-goals.repository';
import { ProductTagsRepository } from '../repositories/product-tags.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private static readonly TEMPLATE_FILE_NAME = 'bulk-upload-one-success-latest.xlsx';
  /** Header + sample rows kept visible while scrolling the wide import sheet. */
  private static readonly IMPORT_TEMPLATE_FROZEN_ROW_COUNT = 3;

  constructor(
    private readonly storageService: StorageService,
    private readonly repository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly productTagsRepository: ProductTagsRepository,
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
    const [
      activeFilters,
      activeCategories,
      activeBrands,
      activeAttributesResult,
      activeHealthConcerns,
      activeWellnessGoals,
      activeProductTags,
    ] = await Promise.all([
      this.categoryFiltersRepository.findAllActiveOrderedByName(),
      this.categoriesRepository.findActiveCategories(),
      this.brandsRepository.findAllActive(),
      this.attributesRepository.findAllByStatus(MasterStatus.ACTIVE),
      this.healthConcernsRepository.findAllActive(),
      this.wellnessGoalsRepository.findAllByStatus(MasterStatus.ACTIVE),
      this.productTagsRepository.findAllByStatus(MasterStatus.ACTIVE),
    ]);

    const categoryFilterHeaders = activeFilters.map((filter) =>
      buildCategoryFilterColumnHeader(filter.name),
    );
    const headers = buildUnifiedBulkUploadHeaders(categoryFilterHeaders);

    const workbook = new ExcelJS.Workbook();

    const attributeOne = activeAttributesResult.find((item) => item.name === 'Color')?.name
      ?? activeAttributesResult[0]?.name
      ?? 'Color';
    const attributeTwo = activeAttributesResult.find((item) => item.name === 'Size')?.name
      ?? activeAttributesResult[1]?.name
      ?? 'Size';

    const importSheet = workbook.addWorksheet('Bulk Import Template');
    const headerRow = importSheet.addRow(headers);
    this.styleHeaderRow(headerRow);
    importSheet.views = [
      {
        state: 'frozen',
        ySplit: BulkUploadService.IMPORT_TEMPLATE_FROZEN_ROW_COUNT,
        activeCell: 'A4',
      },
    ];

    importSheet.addRow(this.buildSimpleSampleRow(headers));
    importSheet.addRow(
      this.buildVariableInlineSampleRow(headers, {
        attributeOne,
        attributeTwo,
        variantCount: 4,
      }),
    );

    const categoryNameById = new Map(
      activeCategories.map((category) => [category.id, category.name]),
    );

    this.addReferenceWorksheet(workbook, 'Category Reference', [
      'Category Name',
      'Hierarchy Level',
      'Parent Category',
      'Use In Sheet Column',
    ], activeCategories.map((category) => [
      category.name,
      this.formatCategoryHierarchyLevel(category.hierarchyLevel),
      category.parentCategoryId
        ? categoryNameById.get(category.parentCategoryId) ?? ''
        : '',
      this.sheetColumnForCategoryLevel(category.hierarchyLevel),
    ]));

    this.addReferenceWorksheet(workbook, 'Brand Reference', [
      'Brand Name',
      'Use In Sheet Column',
    ], activeBrands.map((brand) => [brand.name, 'Brand*']));

    this.addReferenceWorksheet(workbook, 'Attribute Reference', [
      'Attribute Name',
      'Use In Sheet Column',
    ], activeAttributesResult.map((attribute) => [
      attribute.name,
      'Attribute Details',
    ]));

    this.addReferenceWorksheet(workbook, 'Category Filter Reference', [
      'Column Header',
      'Filter Name',
      'Allowed Values',
      'Assigned Categories',
    ], activeFilters.map((filter) => [
      buildCategoryFilterColumnHeader(filter.name),
      filter.name,
      (filter.values ?? []).join(' | '),
      (filter.categories ?? [])
        .map((category) => categoryNameById.get(category.id) ?? '')
        .filter(Boolean)
        .join(' | '),
    ]));

    this.addReferenceWorksheet(workbook, 'Health Concern Reference', [
      'Health Concern Name',
      'Use In Sheet Column',
    ], activeHealthConcerns.map((item) => [item.name, 'Health Concerns']));

    this.addReferenceWorksheet(workbook, 'Wellness Goal Reference', [
      'Wellness Goal Name',
      'Use In Sheet Column',
    ], activeWellnessGoals.map((item) => [item.name, 'Wellness Goals']));

    this.addReferenceWorksheet(workbook, 'Product Tag Reference', [
      'Product Tag Name',
      'Use In Sheet Column',
    ], activeProductTags.map((item) => [item.name, 'Product Tags']));

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addReferenceWorksheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    referenceHeaders: string[],
    rows: Array<Array<string | number | null>>,
  ): void {
    const sheet = workbook.addWorksheet(sheetName);
    const headerRow = sheet.addRow(referenceHeaders);
    this.styleHeaderRow(headerRow);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      sheet.addRow(row);
    }
    referenceHeaders.forEach((_, index) => {
      sheet.getColumn(index + 1).width = 24;
    });
  }

  private formatCategoryHierarchyLevel(level: CategoryHierarchyLevel): string {
    switch (level) {
      case CategoryHierarchyLevel.ROOT:
        return 'Root';
      case CategoryHierarchyLevel.CHILD:
        return 'Sub';
      case CategoryHierarchyLevel.GRANDCHILD:
        return 'Sub Sub';
      case CategoryHierarchyLevel.GREAT_GRANDCHILD:
        return 'Sub Sub Sub';
      default:
        return String(level);
    }
  }

  private sheetColumnForCategoryLevel(level: CategoryHierarchyLevel): string {
    switch (level) {
      case CategoryHierarchyLevel.ROOT:
        return 'Category *';
      case CategoryHierarchyLevel.CHILD:
        return 'Sub Category';
      case CategoryHierarchyLevel.GRANDCHILD:
        return 'Sub Sub Category';
      case CategoryHierarchyLevel.GREAT_GRANDCHILD:
        return 'Sub Sub Sub Category';
      default:
        return 'Category *';
    }
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
      ['Attribute Details', `${options.attributeOne} | ${options.attributeTwo}`],
      ['Product Description', 'Variable product with inline variant slots — SKUs auto-generated.'],
      ['Product Status', 'active'],
      ['common_media_1_url', 'https://example.com/images/shared-hero.webp'],
      ['common_media_2_url', 'https://example.com/images/shared-side.webp'],
      ['common_media_3_url', 'https://example.com/videos/shared-demo.mp4'],
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
