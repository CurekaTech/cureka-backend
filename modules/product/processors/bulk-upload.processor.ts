import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CacheKeys, CacheStrategyService, RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadParserService } from '../services/bulk-upload-parser.service';
import { BulkUploadValidatorService, IValidationError } from '../services/bulk-upload-validator.service';
import { ProductsService } from '../services/products.service';
import { GalleryService } from '../../gallery/services/gallery.service';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { CreateProductDto } from '../dto/product.dto';
import { ProductType } from '../enums/product-type.enum';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as exceljs from 'exceljs';

@Processor('bulk-upload')
export class BulkUploadProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkUploadProcessor.name);

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

      // Update status to processing in database
      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.PROCESSING,
      });

      // Download file stream to temp workspace location
      await mkdir(tempDir, { recursive: true });
      const readStream = await this.storageService.createReadStream(fileUrl);
      await pipeline(readStream, createWriteStream(tempFilePath));
      this.logger.log(`Downloaded storage file to temp path: ${tempFilePath}`);

      // 2. Parse and group rows in chunks
      const sheetSkus = new Set<string>();
      const allErrors: IValidationError[] = [];
      let totalProductsGrouped = 0;
      let successfulProducts = 0;
      let failedProducts = 0;

      const totalRowsScanned = await this.parserService.parseAndBatch(
        tempFilePath,
        fileUrl.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        100, // chunk size of 100 products
        async (batch, scannedRows) => {
          totalProductsGrouped += batch.length;
          
          // Execute batch validation
          const { errors, validatedProducts } = this.validatorService.validateBatch(batch, sheetSkus);

          // For successfully validated products, transform and save them to the DB using existing ProductsService
          for (const group of validatedProducts) {
            try {
              const refs = this.validatorService.resolveReferences(group);
              
              // Process images for variants (copy from ZIP or temp path to persistent products/ path)
              const processedVariants = group.variants ? await Promise.all(
                group.variants.map(async (v) => {
                  const processedImages = [];
                  for (const img of v.images) {
                    try {
                      let imgStream: Readable;
                      const normName = img.filename.toLowerCase().trim();
                      const galleryImgUrl = galleryMap.get(normName);

                      if (galleryImgUrl) {
                        imgStream = await this.storageService.createReadStream(galleryImgUrl);
                        this.logger.log(`Resolved image ${img.filename} from Media Gallery.`);
                      } else {
                        const tempImgPath = `bulk-uploads/temp-images/${img.filename}`;
                        imgStream = await this.storageService.createReadStream(tempImgPath);
                      }

                      const uploadRes = await this.storageService.uploadImage({
                        stream: imgStream,
                        mimetype: img.filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
                        originalFilename: img.filename,
                        folder: 'products',
                      });
                      processedImages.push({
                        url: uploadRes.path,
                        isPrimary: img.isPrimary,
                        sortOrder: img.sortOrder,
                      });
                    } catch (imgError) {
                      this.logger.warn(`Could not resolve image '${img.filename}' from Gallery or temp-images: ${imgError instanceof Error ? imgError.message : String(imgError)}`);
                    }
                  }

                  const processedAttributes = v.attributes ? v.attributes.map((attr) => {
                    const attrRefId = this.validatorService.resolveAttributeRefId(attr.name);
                    return {
                      attributeRefId: attrRefId!,
                      value: attr.value,
                    };
                  }).filter(a => !!a.attributeRefId) : [];

                  return {
                    sku: v.sku,
                    barcode: v.barcode,
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

              const dto: CreateProductDto = {
                name: group.name,
                productType: group.productType as ProductType,
                productNatureRefId: refs.productNatureRefId,
                categoryRefId: refs.categoryRefId!,
                subCategoryRefId: refs.subCategoryRefId,
                subSubCategoryRefId: refs.subSubCategoryRefId,
                subSubSubCategoryRefId: refs.subSubSubCategoryRefId,
                brandRefId: refs.brandRefId!,
                description: group.description,
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
                metaTitle: group.metaTitle,
                metaDescription: group.metaDescription,
                metaKeywords: group.metaKeywords,
                categoryFilters: group.categoryFilters.length ? group.categoryFilters : undefined,
                sizeChart: group.sizeChart
                  ? this.storageService.toFileReference(group.sizeChart)
                  : undefined,
                manufacturerRefId: refs.manufacturerRefId,
                packerRefId: refs.packerRefId,
                importerRefId: refs.importerRefId,
                countryOfOriginRefId: refs.countryOfOriginRefId,
                components: group.components,
                expiresInMonths: group.expiresInMonths,
                customFaqs: group.faqs && group.faqs.length > 0 ? group.faqs : undefined,
                productInformation: (() => {
                  const info: any[] = [];
                  let sortOrder = 1;
                  
                  const addInfo = (label: string, content: string | string[] | undefined) => {
                    if (content) {
                      const text = Array.isArray(content) ? content.join('|') : content;
                      if (text && text.trim()) {
                        info.push({ label, description: text, sortOrder: sortOrder++ });
                      }
                    }
                  };

                  addInfo('Product Highlights', group.highlights);
                  addInfo('Key Features', group.keyFeatures);
                  addInfo('Usage and Safety', group.usageAndSafety);
                  addInfo('Ingredients and Nutrition', group.ingredientsAndNutrition);
                  addInfo('Compliance Detail', group.complianceDetail);
                  addInfo('Additional Info', group.additionalInfo);
                  addInfo('Key Benefits', group.keyBenefits);
                  addInfo('Expert Advice', group.expertAdvice);
                  addInfo('Key Ingredients', group.keyIngredients);
                  addInfo('Other Ingredients', group.otherIngredients);
                  addInfo('Preventive Notes', group.preventiveNotes);
                  addInfo('Accessories', group.accessories);
                  addInfo('Direction of Use', group.directionOfUse);
                  addInfo('Feeding Table', group.feedingTable);
                  addInfo('Safety Information', group.safetyInformation);
                  addInfo('Indications', group.indications);
                  addInfo('Kit contains', group.kitContains);
                  addInfo('Offers', group.offers);
                  addInfo('Description', group.description);

                  return info.length > 0 ? info : undefined;
                })(),
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

              const rowCount = Math.max(1, group.productType === 'bundle'
                ? group.bundleItems.length
                : group.variants.length);

              // Reuses validated creation sequence from existing service
              await this.productsService.createDraft(dto, 'system-bulk-upload');
              successfulProducts += rowCount;
            } catch (dbError) {
              this.logger.error(`Failed to create product '${group.name}' inside database:`, dbError);
              const rowCount = Math.max(1, group.productType === 'bundle'
                ? group.bundleItems.length
                : group.variants.length);
              failedProducts += rowCount;
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
              const rowCount = Math.max(1, group.productType === 'bundle'
                ? group.bundleItems.length
                : group.variants.length);
              failedProducts += rowCount;
            }
          }

          if (errors.length > 0) {
            allErrors.push(...errors);
          }

          // Update validation progress and error metrics in the database
          await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
            totalRows: scannedRows,
            processedRows: scannedRows,
            successfulRows: successfulProducts,
            failedRows: failedProducts,
            errorSummary: allErrors.slice(0, 100), // Limit summary field payload size in db log
          });
        }
      );

      // 3. Generate and upload Error Report Excel sheet if failures exist
      let errorFileUrl: string | null = null;
      if (allErrors.length > 0) {
        errorFileUrl = await this.generateAndUploadErrorReport(uploadRefId, allErrors);
      }

      // Determine final status
      let finalStatus = BulkUploadStatus.COMPLETED;
      if (failedProducts > 0) {
        finalStatus = successfulProducts > 0 ? BulkUploadStatus.PARTIAL_SUCCESS : BulkUploadStatus.FAILED;
      }

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: finalStatus,
        completedAt: new Date(),
        errorSummary: allErrors, // Write full validation errors list at completion
        errorFileUrl,
      });

      this.logger.log(
        `Bulk Upload Phase 10 completed for ${uploadRefId}. Status: ${finalStatus}. Scanned: ${totalRowsScanned} rows. Successful: ${successfulProducts}. Failed: ${failedProducts}.`
      );
      return { success: true, totalRowsScanned, successfulProducts, failedProducts, errorsCount: allErrors.length, errorFileUrl };
    } catch (error) {
      this.logger.error(`Error during processing of ${uploadRefId}:`, error);

      await this.bulkUploadsRepository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.FAILED,
        completedAt: new Date(),
        errorSummary: [
          {
            rowNumber: 0,
            sku: 'SYSTEM',
            column: 'Processor',
            invalidValue: 'N/A',
            reason: error instanceof Error ? error.message : String(error),
            suggestedFix: 'Check file formats, headers, and column constraints.',
          },
        ],
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
