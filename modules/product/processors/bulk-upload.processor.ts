import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CacheKeys, CacheStrategyService, RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadParserService, countSheetRowsForProductGroup, countVariantSlotsForProductGroup, IParsedImage } from '../services/bulk-upload-parser.service';
import { BulkUploadValidatorService, IValidationError } from '../services/bulk-upload-validator.service';
import {
  isBulkUploadSizeChartResolvableWithoutGallery,
  isRemoteImageUrl,
} from '../utils/bulk-upload-image.util';
import { ProductsService } from '../services/products.service';
import { GalleryService } from '../../gallery/services/gallery.service';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { normalizeProductInformation } from '../utils/product-information.util';
import { ProductType } from '../enums/product-type.enum';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as exceljs from 'exceljs';

@Processor('bulk-upload')
export class BulkUploadProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkUploadProcessor.name);

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      const response = (error as { response?: unknown }).response;
      if (typeof response === 'string' && response.trim()) {
        return response;
      }
      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          const joined = message.map(String).filter(Boolean).join(', ');
          if (joined) return joined;
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }

    const fallback = String(error);
    return fallback && fallback !== '[object Object]'
      ? fallback
      : 'Unexpected bulk upload processor error.';
  }

  private buildSystemError(error: unknown): IValidationError {
    return {
      rowNumber: 0,
      sku: 'SYSTEM',
      column: 'Processor',
      invalidValue: 'N/A',
      reason: this.getErrorMessage(error),
      suggestedFix: 'Check file format, required headers, recognized columns, and master-data values.',
    };
  }

  private resolveUploadMimeType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'image/jpeg';
  }

  private async resolveBulkUploadImage(
    img: IParsedImage,
    galleryMap: Map<string, string>,
  ): Promise<{ url: string; isPrimary: boolean; sortOrder: number } | null> {
    const remoteUrl = img.url?.trim();
    const filename = img.filename?.trim();

    // Prefer gallery/ZIP filename when a remote URL looks like a placeholder (example.com)
    // or when both are present and we can resolve the filename locally first.
    if (filename) {
      const resolvedFromFile = await this.tryResolveBulkUploadImageFromFilename(
        filename,
        img.isPrimary,
        img.sortOrder,
        galleryMap,
      );
      if (resolvedFromFile) {
        return resolvedFromFile;
      }
    }

    if (remoteUrl) {
      if (isRemoteImageUrl(remoteUrl)) {
        try {
          const response = await fetch(remoteUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const uploadRes = await this.storageService.uploadImage({
            stream: Readable.from(Buffer.from(arrayBuffer)),
            mimetype: response.headers.get('content-type') || this.resolveUploadMimeType(remoteUrl),
            originalFilename: remoteUrl.split('/').pop()?.split('?')[0] || 'image.jpg',
            folder: 'products',
          });

          return {
            url: uploadRes.path,
            isPrimary: img.isPrimary,
            sortOrder: img.sortOrder,
          };
        } catch (imgError) {
          this.logger.warn(
            `Could not download image from URL '${remoteUrl}': ${imgError instanceof Error ? imgError.message : String(imgError)}`,
          );
          return null;
        }
      }

      // Non-http storage path / key — use as-is.
      return {
        url: remoteUrl,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
      };
    }

    return null;
  }

  private async tryResolveBulkUploadImageFromFilename(
    filename: string,
    isPrimary: boolean,
    sortOrder: number,
    galleryMap: Map<string, string>,
  ): Promise<{ url: string; isPrimary: boolean; sortOrder: number } | null> {
    try {
      let imgStream: Readable;
      const normName = filename.toLowerCase().trim();
      const galleryImgUrl = galleryMap.get(normName);

      if (galleryImgUrl) {
        imgStream = await this.storageService.createReadStream(galleryImgUrl);
        this.logger.log(`Resolved image ${filename} from Media Gallery.`);
      } else {
        const tempImgPath = `bulk-uploads/temp-images/${filename}`;
        imgStream = await this.storageService.createReadStream(tempImgPath);
      }

      const uploadRes = await this.storageService.uploadImage({
        stream: imgStream,
        mimetype: this.resolveUploadMimeType(filename),
        originalFilename: filename,
        folder: 'products',
      });

      return {
        url: uploadRes.path,
        isPrimary,
        sortOrder,
      };
    } catch (imgError) {
      this.logger.warn(
        `Could not resolve image '${filename}' from Gallery or temp-images: ${imgError instanceof Error ? imgError.message : String(imgError)}`,
      );
      return null;
    }
  }

  private async resolveBulkUploadSizeChart(
    sizeChart: string,
    galleryMap: Map<string, string>,
  ): Promise<string | null> {
    const value = sizeChart.trim();
    if (!value) {
      return null;
    }

    if (isBulkUploadSizeChartResolvableWithoutGallery(value)) {
      if (isRemoteImageUrl(value)) {
        const resolved = await this.resolveBulkUploadImage(
          {
            url: value,
            isPrimary: false,
            sortOrder: 0,
          },
          galleryMap,
        );
        return resolved?.url ?? null;
      }

      return value;
    }

    const normalized = value.toLowerCase().trim();
    return galleryMap.get(normalized) ?? value;
  }

  constructor(
    private readonly bulkUploadsRepository: BulkUploadsRepository,
    private readonly redisConnection: RedisConnectionService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageService: StorageService,
    private readonly parserService: BulkUploadParserService,
    private readonly validatorService: BulkUploadValidatorService,
    private readonly productsService: ProductsService,
    private readonly galleryService: GalleryService,
  ) {
    super();
  }

  async process(job: Job<{ uploadRefId: string; fileUrl: string; imagesZipUrl?: string }, any, string>): Promise<any> {
    const { uploadRefId, fileUrl, imagesZipUrl } = job.data;
    console.log('[BULK_UPLOAD_DEBUG][Processor.process] JOB_RECEIVED', {
      uploadRefId,
      fileUrl,
      imagesZipUrl,
      jobId: job.id,
      jobName: job.name,
    });
    this.logger.log(`Received bulk upload job for refId: ${uploadRefId}, file: ${fileUrl}, zip: ${imagesZipUrl}`);

    // Enable cache bypass during processing of the heavy bulk sheets
    process.env['BYPASS_PRODUCT_CACHE_LISTENER'] = 'true';

    // Update status to validating in database
    await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
      status: BulkUploadStatus.VALIDATING,
    });

    const tempDir = join(process.cwd(), 'temp-uploads');
    const tempFilePath = join(tempDir, `${uploadRefId}-${Date.now()}.bin`);

    try {
      // 1. Prime validation cache and load Media Gallery mappings
      await this.validatorService.primeValidationCache();
      const galleryMap = await this.galleryService.getAllGalleryMap();
      console.log('[BULK_UPLOAD_DEBUG][Processor.process] CACHE_AND_GALLERY_READY', {
        uploadRefId,
        galleryImageCount: galleryMap.size,
      });

      // Update status to processing in database
      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.PROCESSING,
      });

      // Download file stream to temp workspace location
      await mkdir(tempDir, { recursive: true });
      const readStream = await this.storageService.createReadStream(fileUrl);
      await pipeline(readStream, createWriteStream(tempFilePath));
      console.log('[BULK_UPLOAD_DEBUG][Processor.process] FILE_DOWNLOADED', {
        uploadRefId,
        fileUrl,
        tempFilePath,
      });
      this.logger.log(`Downloaded storage file to temp path: ${tempFilePath}`);

      // 2. Parse and group rows in chunks
      const sheetSkus = new Set<string>();
      const sheetExternalProductIds = new Set<string>();
      const allErrors: IValidationError[] = [];
      let totalProductsGrouped = 0;
      let successfulSheetRows = 0;
      let failedSheetRows = 0;
      let successfulVariantSlots = 0;
      let failedVariantSlots = 0;
      let productsCreated = 0;
      let productsUpdated = 0;

      const labelSortOrders = this.validatorService.getProductInformationLabelSortOrders();

      const totalRowsScanned = await this.parserService.parseAndBatch(
        tempFilePath,
        fileUrl.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        100, // chunk size of 100 products
        async (batch, scannedRows) => {
          totalProductsGrouped += batch.length;
          console.log('[BULK_UPLOAD_DEBUG][Processor.process] BATCH_PARSED', {
            uploadRefId,
            scannedRows,
            batchSize: batch.length,
            groups: batch.map((group) => ({
              rowNumber: group.rowNumber,
              name: group.name,
              category: group.category,
              subCategory: group.subCategory,
              subSubCategory: group.subSubCategory,
              subSubSubCategory: group.subSubSubCategory,
              sku: group.variants[0]?.sku ?? null,
            })),
          });
          
          // Execute batch validation
          const { errors, validatedProducts } = this.validatorService.validateBatch(
            batch,
            sheetSkus,
            sheetExternalProductIds,
          );
          console.log('[BULK_UPLOAD_DEBUG][Processor.process] BATCH_VALIDATED', {
            uploadRefId,
            errorCount: errors.length,
            validatedCount: validatedProducts.length,
            errors,
          });

          // For successfully validated products, transform and save them to the DB using existing ProductsService
          for (const group of validatedProducts) {
            try {
              if (
                group.sizeChart &&
                !isBulkUploadSizeChartResolvableWithoutGallery(group.sizeChart)
              ) {
                const normalizedSizeChart = group.sizeChart.toLowerCase().trim();
                if (!galleryMap.has(normalizedSizeChart)) {
                  const sheetRows = countSheetRowsForProductGroup(group);
                  failedSheetRows += sheetRows;
                  failedVariantSlots += countVariantSlotsForProductGroup(group);
                  allErrors.push({
                    rowNumber: group.rowNumber,
                    sku: 'PARENT',
                    column: 'Size Chart Filename/Path',
                    invalidValue: group.sizeChart,
                    reason: `Size chart "${group.sizeChart}" does not exist in Media Gallery.`,
                    suggestedFix:
                      'Upload the file to Media Gallery first, provide Size Chart URL, or use an images/ storage path.',
                  });
                  continue;
                }
              }

              const refs = this.validatorService.resolveReferences(group);
              
              const processedVariants = group.variants ? await Promise.all(
                group.variants.map(async (v) => {
                  const processedImages = [];
                  for (const img of v.images) {
                    const resolved = await this.resolveBulkUploadImage(img, galleryMap);
                    if (resolved) {
                      processedImages.push(resolved);
                    }
                  }

                  const processedAttributes = v.attributes
                    ? v.attributes
                        .map((attr) => {
                          const lookup = attr.refId ?? attr.name;
                          const attrRefId = lookup
                            ? this.validatorService.resolveAttributeRefId(lookup)
                            : undefined;
                          return {
                            attributeRefId: attrRefId!,
                            value: attr.value,
                          };
                        })
                        .filter((item) => !!item.attributeRefId)
                    : [];

                  return {
                    sku: v.sku,
                    vendorSku: group.vendorSku,
                    barcode: v.barcode,
                    gtinNumber: v.gtinNumber,
                    hsnCode: v.hsnCode,
                    batchNumber: v.batchNumber,
                    expiryDate: v.expiryDate,
                    mrp: v.mrp,
                    sellingPrice: v.sellingPrice,
                    discountPercentage: v.discountPercentage,
                    taxClass: v.taxClass,
                    stock: v.stock,
                    weight: v.weight,
                    weightUnit: v.weightUnit,
                    length: v.length,
                    lengthUnit: v.lengthUnit,
                    width: v.width,
                    widthUnit: v.widthUnit,
                    height: v.height,
                    heightUnit: v.heightUnit,
                    status: v.status,
                    attributes: processedAttributes,
                    images: processedImages,
                  };
                })
              ) : undefined;

              const processedCommonMedia = [];
              for (const img of group.commonMedia ?? []) {
                const resolved = await this.resolveBulkUploadImage(img, galleryMap);
                if (resolved) {
                  processedCommonMedia.push({
                    type: ProductMediaType.COMMON,
                    url: resolved.url,
                    isPrimary: resolved.isPrimary ?? processedCommonMedia.length === 0,
                    sortOrder: resolved.sortOrder ?? processedCommonMedia.length,
                  });
                }
              }
              this.logger.log(
                `[BULK_UPLOAD] product="${group.name}" commonMediaParsed=${group.commonMedia?.length ?? 0} commonMediaResolved=${processedCommonMedia.length}`,
              );

              const attributeRefIds = new Set<string>();
              if (processedVariants) {
                for (const pv of processedVariants) {
                  for (const attr of pv.attributes) {
                    if (attr.attributeRefId) {
                      attributeRefIds.add(attr.attributeRefId);
                    }
                  }
                }
              }

              const normalizedProductInformation = group.productInformation.length
                ? normalizeProductInformation(group.productInformation, labelSortOrders)
                : undefined;
              const descriptionFromProductInformation = normalizedProductInformation?.find(
                (item) => item.label.toLowerCase().trim() === 'description',
              )?.description;

              const dto: CreateProductDto = {
                name: group.name,
                productType: group.productType as ProductType,
                productNatureRefId: refs.productNatureRefId,
                categoryRefId: refs.categoryRefId!,
                subCategoryRefId: refs.subCategoryRefId,
                subSubCategoryRefId: refs.subSubCategoryRefId,
                subSubSubCategoryRefId: refs.subSubSubCategoryRefId,
                brandRefId: refs.brandRefId!,
                description: descriptionFromProductInformation,
                tagNames: group.productTags,
                healthConcernRefIds: refs.healthConcernRefIds,
                wellnessGoalRefIds: refs.wellnessGoalRefIds,
                attributeRefIds: attributeRefIds.size > 0 ? Array.from(attributeRefIds) : undefined,
                subscriptionEnabled: group.subscriptionEnabled,
                returnAllowed: group.returnAllowed,
                returnPolicy: group.returnPolicy,
                returnWindowDays: group.returnWindowDays,
                codAvailable: group.codAvailable,
                emiAvailable: group.emiAvailable,
                replaceAllowed: group.replaceAllowed,
                replaceWindowDays: group.replaceWindowDays,
                slug: group.slugUrl || undefined,
                externalProductId: group.externalProductId,
                singleProductUrl: group.singleProductUrl,
                packMetadata: group.packMetadata.length ? group.packMetadata : undefined,
                manufacturerAddress: group.manufacturerAddress,
                packerAddress: group.packerAddress,
                importerAddress: group.importerAddress,
                metaTitle: group.metaTitle,
                metaDescription: group.metaDescription,
                metaKeywords: group.metaKeywords,
                categoryFilters: group.categoryFilters.length ? group.categoryFilters : undefined,
                sizeChart: group.sizeChart
                  ? this.storageService.toFileReference(
                      (await this.resolveBulkUploadSizeChart(group.sizeChart, galleryMap)) ??
                        group.sizeChart,
                    )
                  : undefined,
                manufacturerRefId: refs.manufacturerRefId,
                packerRefId: refs.packerRefId,
                importerRefId: refs.importerRefId,
                countryOfOriginRefId: refs.countryOfOriginRefId,
                components: group.components,
                expiresInMonths: group.expiresInMonths,
                customFaqs: group.faqs && group.faqs.length > 0 ? group.faqs : undefined,
                productInformation: normalizedProductInformation,
                media: processedCommonMedia.length ? processedCommonMedia : undefined,
                variants: processedVariants,
                bundleItems: group.productType === 'bundle'
                  ? group.bundleItems.map((item) => {
                      const childRefId = this.validatorService.resolveProductRefIdBySku(item.childSku);
                      return {
                        childProductRefId: childRefId!,
                        quantity: item.quantity,
                      };
                    }).filter(item => !!item.childProductRefId)
                  : undefined,
              };

              const sheetRows = countSheetRowsForProductGroup(group);
              const variantSlots = countVariantSlotsForProductGroup(group);

              const existingProductRefId = this.validatorService.resolveExistingProductRefIdForGroup(group);
              if (existingProductRefId) {
                await this.productsService.update(
                  existingProductRefId,
                  dto as UpdateProductDto,
                  'system-bulk-upload',
                );
                productsUpdated += 1;
              } else {
                await this.productsService.createDraft(dto, 'system-bulk-upload');
                productsCreated += 1;
              }
              successfulSheetRows += sheetRows;
              successfulVariantSlots += variantSlots;
            } catch (dbError) {
              this.logger.error(`Failed to create product '${group.name}' inside database:`, dbError);
              failedSheetRows += countSheetRowsForProductGroup(group);
              failedVariantSlots += countVariantSlotsForProductGroup(group);
              allErrors.push({
                rowNumber: group.rowNumber,
                sku: 'PARENT',
                column: 'Database',
                invalidValue: group.name,
                reason: dbError instanceof Error ? dbError.message : String(dbError),
                suggestedFix: 'Resolve conflicting unique constraints or missing master records.',
              });
            }
          }

          // Count groups that failed validation
          const validatedSet = new Set(validatedProducts);
          for (const group of batch) {
            if (!validatedSet.has(group)) {
              failedSheetRows += countSheetRowsForProductGroup(group);
              failedVariantSlots += countVariantSlotsForProductGroup(group);
            }
          }

          if (errors.length > 0) {
            allErrors.push(...errors);
          }

          // Update validation progress and error metrics in the database
          await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
            totalRows: scannedRows,
            processedRows: scannedRows,
            successfulRows: successfulSheetRows,
            failedRows: failedSheetRows,
            errorSummary: allErrors.slice(0, 100), // Limit summary field payload size in db log
          });
        },
        this.validatorService.getActiveProductInformationLabels(),
        this.validatorService.getActiveCategoryFilterNames(),
      );

      // 3. Generate and upload Error Report Excel sheet if failures exist
      let errorFileUrl: string | null = null;
      if (allErrors.length > 0) {
        errorFileUrl = await this.generateAndUploadErrorReport(uploadRefId, allErrors);
      }

      // Determine final status
      let finalStatus = BulkUploadStatus.COMPLETED;
      if (failedSheetRows > 0) {
        finalStatus = successfulSheetRows > 0 ? BulkUploadStatus.PARTIAL_SUCCESS : BulkUploadStatus.FAILED;
      }

      const uploadSummary = {
        sheetRows: totalRowsScanned,
        productsCreated,
        productsUpdated,
        successfulSheetRows,
        failedSheetRows,
        variantSlotsSucceeded: successfulVariantSlots,
        variantSlotsFailed: failedVariantSlots,
        message:
          `Sheet rows: ${totalRowsScanned}. Rows succeeded: ${successfulSheetRows}, failed: ${failedSheetRows}. ` +
          `Products created: ${productsCreated}, updated: ${productsUpdated}. ` +
          `Variant slots processed: ${successfulVariantSlots} succeeded, ${failedVariantSlots} failed ` +
          `(inline variable row with 4 slots = 1 sheet row, 4 variants).`,
      };

      if (uploadSummary.productsUpdated > 0 || uploadSummary.productsCreated > 0) {
        allErrors.push({
          rowNumber: 0,
          sku: 'SUMMARY',
          column: '__upload_summary__',
          invalidValue: JSON.stringify(uploadSummary),
          reason: uploadSummary.message,
          suggestedFix: '',
        });
      }

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: finalStatus,
        completedAt: new Date(),
        errorSummary: allErrors,
        errorFileUrl,
      });

      this.logger.log(
        `Bulk Upload Phase 10 completed for ${uploadRefId}. Status: ${finalStatus}. Scanned: ${totalRowsScanned} sheet rows. Successful rows: ${successfulSheetRows}. Failed rows: ${failedSheetRows}.`
      );
      return {
        success: true,
        totalRowsScanned,
        successfulSheetRows,
        failedSheetRows,
        successfulVariantSlots,
        failedVariantSlots,
        errorsCount: allErrors.length,
        errorFileUrl,
      };
    } catch (error) {
      const systemError = this.buildSystemError(error);
      if (error instanceof Error) {
        this.logger.error(
          `Error during processing of ${uploadRefId}: ${systemError.reason}`,
          error.stack,
        );
      } else {
        this.logger.error(`Error during processing of ${uploadRefId}: ${systemError.reason}`);
      }

      const existingRecord = await this.bulkUploadsRepository.findByRefId(uploadRefId);
      const existingErrors = Array.isArray(existingRecord?.errorSummary)
        ? existingRecord.errorSummary
        : [];
      const totalRows = Math.max(existingRecord?.totalRows ?? 0, 1);
      const processedRows = Math.max(existingRecord?.processedRows ?? 0, totalRows);
      const failedRows = Math.max(existingRecord?.failedRows ?? 0, 1);

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.FAILED,
        totalRows,
        processedRows,
        successfulRows: existingRecord?.successfulRows ?? 0,
        failedRows,
        completedAt: new Date(),
        errorSummary: [...existingErrors, systemError],
      });

      throw error;
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFilePath);
        this.logger.log(`Cleaned up temp file: ${tempFilePath}`);
      } catch (err) {
        // Ignore if file doesn't exist
      }



      // Restore cache invalidations and run exactly one single global purge
      delete process.env['BYPASS_PRODUCT_CACHE_LISTENER'];
      try {
        await this.cacheStrategy.invalidateOnly({
          patterns: [
            CacheKeys.products.listPattern(),
            CacheKeys.products.detailPattern(),
            CacheKeys.publicProducts.listPattern(),
            CacheKeys.publicProducts.variantSearchPattern(),
            CacheKeys.publicProducts.detailPattern(),
          ],
        });
        this.logger.log(`Released bypass: triggered single global cache invalidation for job ${uploadRefId}`);
      } catch (cacheErr) {
        this.logger.error('Failed to trigger final bulk cache invalidation:', cacheErr);
      }

      // Release distributed lock
      const redis = await this.redisConnection.getConnectedClient();
      if (redis) {
        await redis.del('locks:bulk-upload');
        this.logger.log(`Released lock 'locks:bulk-upload' for job ${uploadRefId}`);
      }
    }
  }

  /**
   * Generates an Excel report listing all errors and uploads it to storage.
   */
  private async generateAndUploadErrorReport(uploadRefId: string, errors: IValidationError[]): Promise<string> {
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Upload Errors');

    // Define columns
    worksheet.columns = [
      { header: 'Row Number', key: 'rowNumber', width: 12 },
      { header: 'SKU / Reference', key: 'sku', width: 20 },
      { header: 'Column Name', key: 'column', width: 18 },
      { header: 'Invalid Value', key: 'invalidValue', width: 30 },
      { header: 'Error Reason', key: 'reason', width: 45 },
      { header: 'Suggested Fix', key: 'suggestedFix', width: 45 },
    ];

    // Style header row (Bold + Light Gray fill)
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4F81BD' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 25;

    // Add rows
    for (const err of errors) {
      if (err.column === '__upload_summary__') continue;
      const row = worksheet.addRow({
        rowNumber: err.rowNumber,
        sku: err.sku,
        column: err.column,
        invalidValue: err.invalidValue,
        reason: err.reason,
        suggestedFix: err.suggestedFix,
      });

      // Highlight failed cells with soft red borders/colors
      row.getCell(5).font = { color: { argb: 'C00000' } };
    }

    // Adjust alignment and add thin borders
    worksheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'left' };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'D3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'D3D3D3' } },
          left: { style: 'thin', color: { argb: 'D3D3D3' } },
          right: { style: 'thin', color: { argb: 'D3D3D3' } },
        };
      });
    });

    const errorReportDir = join(process.cwd(), 'temp-uploads');
    await mkdir(errorReportDir, { recursive: true });
    const errorReportPath = join(errorReportDir, `errors-${uploadRefId}-${Date.now()}.xlsx`);

    try {
      // Save sheet locally
      await workbook.xlsx.writeFile(errorReportPath);

      // Upload to Storage provider under "bulk-uploads/errors"
      const readStream = createReadStream(errorReportPath);
      const uploadRes = await this.storageService.uploadImage({
        stream: readStream,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        originalFilename: `errors-${uploadRefId}.xlsx`,
        folder: 'bulk-uploads/errors',
      });

      this.logger.log(`Uploaded bulk upload error report to: ${uploadRes.path}`);
      return uploadRes.path;
    } finally {
      // Cleanup local temp file
      try {
        await unlink(errorReportPath);
      } catch (err) {
        // ignore
      }
    }
  }
}
