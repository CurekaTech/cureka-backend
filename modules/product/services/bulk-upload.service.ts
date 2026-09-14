import { BadRequestException, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StorageService } from '@packages/storage';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisConnectionService } from '@packages/cache';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { generateUniqueRefId } from '@packages/common';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { BulkUploadType } from '../enums/bulk-upload-type.enum';
import { join } from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
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
import { ProductInformationLabelsRepository } from '../repositories/product-information-labels.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { randomUUID } from 'crypto';
import {
  BULK_UPLOAD_LOCK_KEY,
  releaseBulkUploadLock,
} from '../utils/bulk-upload-lock.util';
import {
  forceReleaseBulkUploadLock,
  markBulkUploadCancelled,
} from '../utils/bulk-upload-cancel.util';
import { BulkUploadExportStreamService } from './bulk-upload-export-stream.service';

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private static readonly TEMPLATE_FILE_NAME = 'bulk-upload-one-success-latest.xlsx';
  private static readonly EXPORT_XLSX_FILE_NAME = 'bulk-export-products.xlsx';
  private static readonly EXPORT_CSV_FILE_NAME = 'bulk-export-products.csv';
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
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly configService: ConfigService,
    private readonly exportStreamService: BulkUploadExportStreamService,
    @InjectQueue('bulk-upload') private readonly queue: Queue,
  ) {}

  async createBulkUploadJob(req: FastifyRequest, createdBy: string) {

    // 1. Concurrency Check (Distributed Lock)
    const redis = await this.redisConnection.getConnectedClient();
    const lockToken = randomUUID();
    const lockTtlMs = this.configService.get<number>(
      'PRODUCT_BULK_UPLOAD_LOCK_TTL_MS',
      1800000,
    );
    if (redis) {
      const acquired = await redis.set(
        BULK_UPLOAD_LOCK_KEY,
        lockToken,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (!acquired) {
        throw new ConflictException('Another bulk upload is currently in progress. Please try again later.');
      }
    } else {
      // Fallback check against database status if Redis is down
      const activeCount = await this.repository.countActiveJobs(BulkUploadType.PRODUCT);
      if (activeCount > 0) {
        throw new ConflictException('Another bulk upload is currently in progress. Please try again later.');
      }
    }

    if (!req.isMultipart()) {
      if (redis) {
        await releaseBulkUploadLock(redis, lockToken);
      }
      throw new BadRequestException('Request must be multipart/form-data.');
    }

    const maxSheetSize = this.configService.get<number>(
      'PRODUCT_BULK_UPLOAD_MAX_SHEET_SIZE',
      41943040,
    );
    const parts = req.parts({ limits: { fileSize: maxSheetSize } });
    let fileUrl: string | null = null;
    let imagesZipUrl: string | null = null;

    try {
      for await (const part of parts) {
        const filePart = part as any;
        if (filePart.file) {
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
          } else if (filePart.fieldname === 'imagesZip' || filePart.fieldname === 'images' || filePart.fieldname === 'zip') {
            const zipUploadResult = await this.storageService.uploadImage({
              stream: filePart.file,
              mimetype: filePart.mimetype,
              originalFilename: filePart.filename,
              folder: 'bulk-uploads',
            });
            imagesZipUrl = zipUploadResult.path;
          } else {
            filePart.file.resume();
          }
        }
      }
    } catch (err) {
      if (redis) {
        await releaseBulkUploadLock(redis, lockToken);
      }
      throw err;
    }

    if (!fileUrl) {
      if (redis) {
        await releaseBulkUploadLock(redis, lockToken);
      }
      throw new BadRequestException('No file uploaded. Send multipart/form-data with a "file" field.');
    }

    const refId = await generateUniqueRefId('BUP', (candidate) =>
      this.repository.existsByRefId(candidate),
    );

    const record = await this.repository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      uploadType: BulkUploadType.PRODUCT,
      fileUrl,
      imagesZipUrl,
      totalRows: 0,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      errorSummary: [],
      createdBy,
    });

    // 2. Queue background job
    try {
      await this.queue.add('process-sheet', {
        uploadRefId: record.refId,
        fileUrl: record.fileUrl,
        imagesZipUrl: record.imagesZipUrl || undefined,
        lockToken: redis ? lockToken : undefined,
        lockTtlMs,
      });
    } catch (queueError) {
      this.logger.error(
        {
          refId: record.refId,
          error: queueError instanceof Error ? queueError.message : String(queueError),
        },
        'Failed to queue bulk upload job',
      );
      // If queueing fails, mark DB record as failed and release lock
      await this.repository.updateFieldsByRefId(record.refId, {
        status: BulkUploadStatus.FAILED,
        errorSummary: [{ rowNumber: 0, sku: 'SYSTEM', column: 'Queue', invalidValue: 'N/A', reason: 'Failed to queue background job', suggestedFix: 'Contact system administrator.' }],
      });
      if (redis) {
        await releaseBulkUploadLock(redis, lockToken);
      }
      throw new BadRequestException(`Failed to queue bulk upload task: ${queueError instanceof Error ? queueError.message : String(queueError)}`);
    }

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
    const fileBuffer = await this.buildTemplateBuffer({ includeSampleRows: true });
    const templatePath = join(process.cwd(), 'docs', fileName);
    await writeFile(templatePath, fileBuffer);
    return { fileName, fileBuffer };
  }

  async streamExportToReply(reply: FastifyReply): Promise<void> {
    const configuredTimeout = Number(
      this.configService.get('PRODUCT_BULK_EXPORT_TIMEOUT_MS') ?? 15 * 60 * 1000,
    );
    const exportTimeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 15 * 60 * 1000;
    reply.raw.setTimeout(exportTimeoutMs);

    const fileBuffer = await this.exportStreamService.buildExportCsvBuffer();

    await reply
      .code(200)
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${BulkUploadService.EXPORT_CSV_FILE_NAME}"`,
      )
      .header('Content-Length', String(fileBuffer.length))
      .send(fileBuffer);
  }

  async createBulkExportJob(createdBy: string) {
    const redis = await this.redisConnection.getConnectedClient();
    const lockToken = randomUUID();
    const lockTtlMs = this.configService.get<number>(
      'PRODUCT_BULK_UPLOAD_LOCK_TTL_MS',
      1800000,
    );

    if (redis) {
      const acquired = await redis.set(
        BULK_UPLOAD_LOCK_KEY,
        lockToken,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (!acquired) {
        throw new ConflictException(
          'Another bulk upload/export is currently in progress. Please try again later.',
        );
      }
    } else {
      const activeCount = await this.repository.countActiveJobs(BulkUploadType.PRODUCT);
      if (activeCount > 0) {
        throw new ConflictException(
          'Another bulk upload/export is currently in progress. Please try again later.',
        );
      }
    }

    const refId = await generateUniqueRefId('BUP', (candidate) =>
      this.repository.existsByRefId(candidate),
    );

    const record = await this.repository.create({
      refId,
      status: BulkUploadStatus.QUEUED,
      uploadType: BulkUploadType.PRODUCT,
      fileUrl: 'export:pending',
      imagesZipUrl: null,
      totalRows: await this.productsRepository.countForBulkExport(),
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0,
      errorSummary: [{ rowNumber: 0, sku: 'SYSTEM', column: 'operation', invalidValue: 'export', reason: 'Bulk export job', suggestedFix: '' }],
      createdBy,
    });

    try {
      await this.queue.add('export-products', {
        exportRefId: record.refId,
        lockToken: redis ? lockToken : undefined,
        lockTtlMs,
      });
    } catch (queueError) {
      await this.repository.updateFieldsByRefId(record.refId, {
        status: BulkUploadStatus.FAILED,
        errorSummary: [{
          rowNumber: 0,
          sku: 'SYSTEM',
          column: 'Queue',
          invalidValue: 'N/A',
          reason: 'Failed to queue bulk export task',
          suggestedFix: 'Contact system administrator.',
        }],
      });
      if (redis) {
        await releaseBulkUploadLock(redis, lockToken);
      }
      throw new BadRequestException(
        `Failed to queue bulk export task: ${queueError instanceof Error ? queueError.message : String(queueError)}`,
      );
    }

    return {
      refId: record.refId,
      status: record.status,
      operation: 'export',
      createdAt: record.createdAt,
    };
  }

  async getExportDownload(refId: string): Promise<{ fileName: string; fileBuffer: Buffer; contentType: string }> {
    const record = await this.repository.findByRefId(refId);
    if (!record) {
      throw new NotFoundException(`Bulk export job with refId "${refId}" not found`);
    }
    if (record.status !== BulkUploadStatus.COMPLETED && record.status !== BulkUploadStatus.PARTIAL_SUCCESS) {
      throw new BadRequestException(`Bulk export job "${refId}" is not ready for download (status: ${record.status}).`);
    }
    if (!record.fileUrl || record.fileUrl === 'export:pending') {
      throw new NotFoundException(`Export file for job "${refId}" is not available.`);
    }

    const readStream = await this.storageService.createReadStream(record.fileUrl);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      readStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      readStream.on('end', () => resolve());
      readStream.on('error', reject);
    });

    return {
      fileName: BulkUploadService.EXPORT_CSV_FILE_NAME,
      fileBuffer: Buffer.concat(chunks),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  private buildCsvBuffer(
    headers: string[],
    rows: Array<Array<string | number | null>>,
  ): Buffer {
    const escapeCsvCell = (value: string | number | null): string => {
      if (value === null || value === undefined) return '';
      const raw = String(value);
      if (!/[",\r\n]/.test(raw)) {
        return raw;
      }
      return `"${raw.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];
    lines.push(headers.map((header) => escapeCsvCell(header)).join(','));
    for (const row of rows) {
      lines.push(row.map((cell) => escapeCsvCell(cell)).join(','));
    }

    // UTF-8 BOM keeps Excel imports clean for non-ASCII text.
    const csv = `\uFEFF${lines.join('\r\n')}`;
    return Buffer.from(csv, 'utf8');
  }

  private async buildTemplateBuffer(options?: {
    dataRows?: Array<Array<string | number | null>>;
    includeSampleRows?: boolean;
  }): Promise<Buffer> {
    const [
      activeFilters,
      activeCategories,
      activeBrands,
      activeAttributesResult,
      activeHealthConcerns,
      activeWellnessGoals,
      activeProductTags,
      activeProductInformationLabels,
    ] = await Promise.all([
      this.categoryFiltersRepository.findAllActiveOrderedByName(),
      this.categoriesRepository.findActiveCategories(),
      this.brandsRepository.findAllActive(),
      this.attributesRepository.findAllByStatus(MasterStatus.ACTIVE),
      this.healthConcernsRepository.findAllActive(),
      this.wellnessGoalsRepository.findAllByStatus(MasterStatus.ACTIVE),
      this.productTagsRepository.findAllByStatus(MasterStatus.ACTIVE),
      this.productInformationLabelsRepository.findAllByStatus(MasterStatus.ACTIVE),
    ]);

    const categoryFilterHeaders = activeFilters.map((filter) =>
      buildCategoryFilterColumnHeader(filter.name),
    );
    const informationLabelNames = activeProductInformationLabels.map((label) => label.name);
    const headers = buildUnifiedBulkUploadHeaders(categoryFilterHeaders, informationLabelNames);

    const workbook = new ExcelJS.Workbook();

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

    if (options?.dataRows?.length) {
      for (const row of options.dataRows) {
        importSheet.addRow(row);
      }
    } else if (options?.includeSampleRows !== false) {
      const attributeOne = activeAttributesResult.find((item) => item.name === 'Size')?.name
        ?? activeAttributesResult[0]?.name
        ?? 'Size';

      // Sample 1: single category hierarchy (no pipes).
      importSheet.addRow(this.buildSimpleSampleRow(headers));
      // Sample 2: multiple category hierarchies via "|" (index-aligned).
      importSheet.addRow(this.buildMultiCategorySampleRow(headers));

      importSheet.addRow(
        this.buildVerticalStyleGroupVariantRow(headers, {
          attributeOne,
          name: 'Shampoo 250 ml',
          styleGroupId: '5005',
          productId: '54141',
          sku: 'SHA/SAM/250-A1',
          sizeValue: '250ml',
          mrp: 299,
          sellingPrice: 249,
          stock: 50,
          slug: 'shampoo-250-ml',
        }),
      );
      importSheet.addRow(
        this.buildVerticalStyleGroupVariantRow(headers, {
          attributeOne,
          name: 'Shampoo 500 ml',
          styleGroupId: '5005',
          productId: '54142',
          sku: 'SHA/SAM/500-A1',
          sizeValue: '500ml',
          mrp: 499,
          sellingPrice: 399,
          stock: 40,
          slug: 'shampoo-500-ml',
        }),
      );
    }
    // Rows: single-category sample, multi-category sample, then two vertical
    // style_group_id=5005 rows → one variable product with 2 variants.

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

    this.addReferenceWorksheet(workbook, 'Multi-Category Notes', [
      'Rule',
      'Details',
    ], [
      [
        'Multiple hierarchies',
        'Separate values with "|" in Category *, Sub Category, Sub Sub Category, and Sub Sub Sub Category.',
      ],
      [
        'Index alignment',
        'Values are paired by position: Category "A | B", Sub Category "A1 | B1" → A→A1 and B→B1.',
      ],
      [
        'Length validation',
        'All filled hierarchy columns must have the same number of pipe-separated values or the row fails validation.',
      ],
      [
        'Single hierarchy',
        'Leave values without "|" for one hierarchy (existing behavior).',
      ],
      [
        'Empty levels',
        'Use an empty segment for a missing level, e.g. Sub Category "A1 | " when hierarchy 2 has no sub-category.',
      ],
    ]);

    this.addReferenceWorksheet(workbook, 'Brand Reference', [
      'Brand Name',
      'Use In Sheet Column',
    ], activeBrands.map((brand) => [brand.name, 'Brand*']));

    this.addReferenceWorksheet(workbook, 'Attribute Reference', [
      'Attribute Name',
      'Use In Sheet Column',
    ], activeAttributesResult.map((attribute, index) => [
      attribute.name,
      index < 5 ? `Attribute Details ${index + 1}` : 'Attribute Details N',
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
      ['Product Name*', 'Ethicare Hydromax Moisturizing Cream-200gm'],
      ['Product Type *', 'simple'],
      // Single category hierarchy example (no pipes).
      ['Category *', 'Health & Wellness'],
      ['Sub Category', 'Skin Care'],
      ['Sub Sub Category', 'Moisturizers'],
      ['Brand*', 'Samsung'],
      ['Product SKU Code*', 'ETH/HYD/54141-A1'],
      ['MRP (Rs)*', 499],
      ['Selling Price (Rs)*', 399],
      ['Discount Percentage', 20],
      ['Quantity / Stock', 100],
      ['Out Of Stock', 'No'],
      ['Estimated Delivery Time', '3-5 Days'],
      ['Weight (kg)', 0.2],
      ['Weight Unit', 'g'],
      ['Length (cm)', 10],
      ['Width (cm)', 5],
      ['Height (cm)', 5],
      ['Dimension Unit', 'cm'],
      ['Barcode (EAN/UPC)', '8901234567890'],
      ['HSN Code', '21069099'],
      ['Tax Class', 'GST 12%'],
      ['Slug URL', 'ethicare-hydromax-moisturizing-cream-200gm'],
      ['Product URL Slug', 'ethicare-hydromax-moisturizing-cream-200gm'],
      
      // Product ID drives manufacturer + image auto-attach from lookup XLSX files.
      ['Product ID (String)', '54141'],
      ['Product Description', 'Hydromax moisturizing cream — manufacturer & images attach via Product ID. Single category hierarchy example.'],
      ['Product Highlights', 'Moisturizing | Suitable for daily use'],
      ['Product Status', 'published'],
      ['Variant Status', 'active'],
    ]);

    return headers.map((header) => values.get(header) ?? null);
  }

  private buildMultiCategorySampleRow(headers: string[]): Array<string | number | null> {
    const values = new Map<string, string | number | null>([
      ['Product Name*', 'Multi-Category Sample Vitamin C Serum'],
      ['Product Type *', 'simple'],
      // Multiple independent hierarchies — values aligned by pipe index.
      // Hierarchy 1: Health & Wellness → Skin Care → Serums
      // Hierarchy 2: Beauty → Face Care → Treatments
      ['Category *', 'Health & Wellness | Beauty'],
      ['Sub Category', 'Skin Care | Face Care'],
      ['Sub Sub Category', 'Serums | Treatments'],
      ['Brand*', 'Samsung'],
      ['Product SKU Code*', 'ETH/SER/99001-A1'],
      ['MRP (Rs)*', 799],
      ['Selling Price (Rs)*', 649],
      ['Quantity / Stock', 50],
      ['Out Of Stock', 'No'],
      ['Estimated Delivery Time', '5-7 Days'],
      ['Product ID (String)', '99001'],
      [
        'Product Description',
        'Multi-category example: use "|" to assign multiple hierarchies. Category/Sub Category/Sub Sub Category counts must match by index.',
      ],
      ['Product Status', 'published'],
      ['Variant Status', 'active'],
    ]);

    return headers.map((header) => values.get(header) ?? null);
  }

  private buildVerticalStyleGroupVariantRow(
    headers: string[],
    options: {
      attributeOne: string;
      name: string;
      styleGroupId: string;
      productId: string;
      sku: string;
      sizeValue: string;
      mrp: number;
      sellingPrice: number;
      stock: number;
      slug: string;
    },
  ): Array<string | number | null> {
    const values = new Map<string, string | number | null>([
      ['Product Name*', options.name],
      ['Product Type *', 'variable'],
      ['Category *', 'Health & Wellness'],
      ['Brand*', 'Samsung'],
      ['style_group_id', options.styleGroupId],
      ['Product ID (String)', options.productId],
      ['Product SKU Code*', options.sku],
      ['Attribute Details 1', options.attributeOne],
      ['att_attribute_1_value_1', options.sizeValue],
      ['MRP (Rs)*', options.mrp],
      ['Selling Price (Rs)*', options.sellingPrice],
      ['Quantity / Stock', options.stock],
      ['Out Of Stock', 'No'],
      ['Estimated Delivery Time', '3-5 Days'],
      ['Product URL Slug', options.slug],
      ['Product Description', 'Vertical style_group_id sample — two rows bind into one variable product.'],
      ['Product Status', 'published'],
      ['Variant Status', 'active'],
    ]);

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

  async cancelBulkUploadJob(refId: string, cancelledBy: string) {
    const record = await this.repository.findByRefId(refId);
    if (!record) {
      throw new NotFoundException(`Bulk upload job with refId "${refId}" not found`);
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
      await markBulkUploadCancelled(redis, refId);
      const lockReleased = await forceReleaseBulkUploadLock(redis);
      this.logger.warn(
        `[BULK_UPLOAD] Cancel requested for ${refId} by ${cancelledBy}. Lock force-released=${lockReleased}`,
      );
    }

    let removedJobs = 0;
    const jobStates = ['active', 'waiting', 'delayed', 'paused'] as const;
    for (const state of jobStates) {
      const jobs = await this.queue.getJobs([state]);
      for (const job of jobs) {
        if (job.data?.uploadRefId !== refId) {
          continue;
        }
        try {
          await job.remove();
          removedJobs += 1;
        } catch (error) {
          this.logger.warn(
            `[BULK_UPLOAD] Failed to remove ${state} queue job ${job.id} for ${refId}: ${
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
          reason: 'Bulk upload cancelled by administrator',
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
          ? 'Bulk upload cancelled. Queue job removed.'
          : 'Bulk upload cancelled. If processing continues, restart the API worker once.',
    };
  }

  async getHistory(page = 1, limit = 20) {
    const [records, total] = await this.repository.findHistory(page, limit, BulkUploadType.PRODUCT);
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
