import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { CacheStrategyService, RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { BulkCodUpdateParserService } from '../services/bulk-cod-update-parser.service';
import { bulkCodUpdateLock } from '../services/bulk-cod-update.service';
import {
  ICommerceJobSummary,
  ICommerceRowError,
  decideCodProductSync,
  emptyCommerceJobSummary,
} from '../utils/commerce-sheet.util';
import {
  invalidateTouchedProductCaches,
  uploadCommerceErrorWorkbook,
} from '../utils/commerce-sheet-file.util';
import { CommerceSheetJobData, runDownloadedSheetJob } from './commerce-sheet-job.runner';

@Processor('bulk-cod-update', { concurrency: 1 })
export class BulkCodUpdateProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkCodUpdateProcessor.name);

  constructor(
    private readonly repository: BulkUploadsRepository,
    private readonly parser: BulkCodUpdateParserService,
    private readonly storageService: StorageService,
    private readonly redisConnection: RedisConnectionService,
    private readonly cacheStrategy: CacheStrategyService,
    @InjectRepository(ProductVariantEntity)
    private readonly variantRepo: Repository<ProductVariantEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
  ) {
    super();
  }

  async process(job: Job<CommerceSheetJobData>): Promise<void> {
    await runDownloadedSheetJob({
      logPrefix: 'BULK_COD_UPDATE',
      tempDirName: 'bulk-cod-updates',
      repository: this.repository,
      storageService: this.storageService,
      redisConnection: this.redisConnection,
      lock: bulkCodUpdateLock,
      job,
      logger: this.logger,
      work: (tempFilePath, isCancelled) => this.applySheet(job.data.uploadRefId, tempFilePath, isCancelled),
    });
  }

  private async applySheet(
    uploadRefId: string,
    tempFilePath: string,
    isCancelled: () => Promise<boolean>,
  ): Promise<void> {
    const parsed = await this.parser.parseFile(tempFilePath);
    const errors: ICommerceRowError[] = [...parsed.errors];
    const summary = emptyCommerceJobSummary();
    summary.identicalDuplicateRows = parsed.identicalDuplicateRows;
    const includedByProduct = new Map<string, Array<{ variantId: string; codAvailable: boolean }>>();
    const touchedProductIds = new Set<string>();

    await this.repository.updateFieldsByRefId(uploadRefId, {
      status: BulkUploadStatus.PROCESSING,
      totalRows: parsed.totalDataRows,
    });

    for (const row of parsed.rows) {
      if (await isCancelled()) throw new Error('COD update cancelled');
      const matches = await this.variantRepo
        .createQueryBuilder('v')
        .where('v.deletedAt IS NULL')
        .andWhere('v.sku = :sku', { sku: row.sku })
        .getMany();

      if (matches.length === 0) {
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          column: 'SKU',
          invalidValue: row.sku,
          reason: 'No active variant found for this exact SKU',
          suggestedFix: 'Use the SKU exactly as it is stored, including letter case',
        });
        continue;
      }
      if (matches.length > 1) {
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          column: 'SKU',
          invalidValue: row.sku,
          reason: 'More than one active variant has this exact SKU',
          suggestedFix: 'Resolve the duplicate SKU before updating COD',
        });
        continue;
      }

      const variant = matches[0];
      const included = includedByProduct.get(variant.productId) ?? [];
      if (variant.codAvailable === row.codAvailable) {
        summary.variantsAlreadyCompliant += 1;
        included.push({ variantId: variant.id, codAvailable: row.codAvailable });
        includedByProduct.set(variant.productId, included);
        continue;
      }

      try {
        const result = await this.variantRepo.update(
          { id: variant.id },
          { codAvailable: row.codAvailable },
        );
        if (!result.affected) {
          throw new Error('COD update did not change the variant');
        }
        summary.variantsUpdated += 1;
        touchedProductIds.add(variant.productId);
        included.push({ variantId: variant.id, codAvailable: row.codAvailable });
        includedByProduct.set(variant.productId, included);
      } catch (error) {
        summary.databaseFailures += 1;
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          column: 'codAvailable',
          invalidValue: String(row.codAvailable),
          reason: error instanceof Error ? error.message : String(error),
          suggestedFix: 'Retry this row or contact support',
        });
      }
    }

    await this.syncProductFlags(includedByProduct, summary, touchedProductIds);
    await this.finish(uploadRefId, parsed.totalDataRows, errors, summary, touchedProductIds);
  }

  private async syncProductFlags(
    includedByProduct: Map<string, Array<{ variantId: string; codAvailable: boolean }>>,
    summary: ICommerceJobSummary,
    touchedProductIds: Set<string>,
  ): Promise<void> {
    const productIds = [...includedByProduct.keys()];
    if (!productIds.length) return;

    const variants = await this.variantRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.productId'])
      .where('v.deletedAt IS NULL')
      .andWhere('v.productId IN (:...ids)', { ids: productIds })
      .getMany();
    const variantsByProduct = new Map<string, string[]>();
    for (const variant of variants) {
      const ids = variantsByProduct.get(variant.productId) ?? [];
      ids.push(variant.id);
      variantsByProduct.set(variant.productId, ids);
    }

    const products = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.codAvailable'])
      .where('p.deletedAt IS NULL')
      .andWhere('p.id IN (:...ids)', { ids: productIds })
      .getMany();
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const [productId, included] of includedByProduct) {
      const decision = decideCodProductSync(variantsByProduct.get(productId) ?? [], included);
      if (decision.decision === 'partial') {
        summary.productsSkippedPartialCodCoverage += 1;
        continue;
      }
      if (decision.decision === 'conflict' || decision.value == null) {
        summary.productsSkippedConflictingCodValues += 1;
        continue;
      }
      const product = productById.get(productId);
      if (!product || product.codAvailable === decision.value) continue;
      try {
        const result = await this.productRepo.update(
          { id: productId },
          { codAvailable: decision.value },
        );
        if (!result.affected) throw new Error('Product COD flag update did not change the product');
        summary.productCodFlagsUpdated += 1;
        touchedProductIds.add(productId);
      } catch (error) {
        summary.databaseFailures += 1;
        this.logger.error(
          `[BULK_COD_UPDATE] Product ${productId} COD flag update failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async finish(
    uploadRefId: string,
    totalRows: number,
    errors: ICommerceRowError[],
    summary: ICommerceJobSummary,
    touchedProductIds: Set<string>,
  ): Promise<void> {
    if (touchedProductIds.size) {
      const cacheResult = await invalidateTouchedProductCaches(
        this.cacheStrategy,
        this.productRepo,
        [...touchedProductIds],
      );
      if (cacheResult.failed) {
        summary.cacheInvalidationFailures = cacheResult.refIds.length;
        summary.cacheFailureProductRefIds = cacheResult.refIds;
        this.logger.error(
          `[BULK_COD_UPDATE] Cache invalidation failed for ${uploadRefId}. Product ref ids: ${cacheResult.refIds.join(', ')}. Run npm run cache:invalidate-products`,
        );
      }
    }

    let errorFileUrl: string | null = null;
    if (errors.length) {
      try {
        errorFileUrl = await uploadCommerceErrorWorkbook(
          this.storageService,
          uploadRefId,
          errors,
          'bulk-cod-updates/errors',
        );
      } catch (error) {
        this.logger.error(
          `[BULK_COD_UPDATE] Error workbook upload failed for ${uploadRefId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const successfulRows = summary.variantsUpdated + summary.productCodFlagsUpdated;
    let status = BulkUploadStatus.COMPLETED;
    if (successfulRows === 0 && errors.length > 0) status = BulkUploadStatus.FAILED;
    else if (errors.length > 0) status = BulkUploadStatus.PARTIAL_SUCCESS;

    await this.repository.updateFieldsByRefId(uploadRefId, {
      status,
      totalRows,
      processedRows: totalRows,
      successfulRows,
      failedRows: errors.length,
      errorFileUrl,
      errorSummary: [summary, ...errors.slice(0, 1000)],
      completedAt: new Date(),
    });
    this.logger.log(
      `[BULK_COD_UPDATE] Finished ${uploadRefId} status=${status} variants=${successfulRows} products=${summary.productCodFlagsUpdated} fail=${errors.length}`,
    );
  }
}
