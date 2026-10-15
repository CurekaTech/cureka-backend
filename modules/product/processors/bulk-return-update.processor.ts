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
import {
  BulkReturnUpdateParserService,
  IParsedReturnRow,
} from '../services/bulk-return-update-parser.service';
import { bulkReturnUpdateLock } from '../services/bulk-return-update.service';
import {
  ICommerceJobSummary,
  ICommerceRowError,
  IReturnWrite,
  emptyCommerceJobSummary,
  returnWriteKey,
  sameReturnWrite,
} from '../utils/commerce-sheet.util';
import {
  invalidateTouchedProductCaches,
  uploadCommerceErrorWorkbook,
} from '../utils/commerce-sheet-file.util';
import { CommerceSheetJobData, runDownloadedSheetJob } from './commerce-sheet-job.runner';

interface ResolvedReturnRow {
  row: IParsedReturnRow;
  variant: ProductVariantEntity;
}

@Processor('bulk-return-update', { concurrency: 1 })
export class BulkReturnUpdateProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkReturnUpdateProcessor.name);

  constructor(
    private readonly repository: BulkUploadsRepository,
    private readonly parser: BulkReturnUpdateParserService,
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
      logPrefix: 'BULK_RETURN_UPDATE',
      tempDirName: 'bulk-return-updates',
      repository: this.repository,
      storageService: this.storageService,
      redisConnection: this.redisConnection,
      lock: bulkReturnUpdateLock,
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
    const touchedProductIds = new Set<string>();

    await this.repository.updateFieldsByRefId(uploadRefId, {
      status: BulkUploadStatus.PROCESSING,
      totalRows: parsed.totalDataRows,
    });

    const resolved: ResolvedReturnRow[] = [];
    for (const row of parsed.rows) {
      if (await isCancelled()) throw new Error('Return and replacement update cancelled');
      const matches = await this.variantRepo
        .createQueryBuilder('v')
        .where('v.deletedAt IS NULL')
        .andWhere('v.sku = :sku', { sku: row.sku })
        .getMany();
      if (matches.length === 0) {
        errors.push(this.skuError(row, 'No active variant found for this exact SKU', 'Use the SKU exactly as it is stored, including letter case'));
        continue;
      }
      if (matches.length > 1) {
        errors.push(this.skuError(row, 'More than one active variant has this exact SKU', 'Resolve the duplicate SKU before updating return settings'));
        continue;
      }
      resolved.push({ row, variant: matches[0] });
    }

    const byProduct = new Map<string, ResolvedReturnRow[]>();
    for (const item of resolved) {
      const group = byProduct.get(item.variant.productId) ?? [];
      group.push(item);
      byProduct.set(item.variant.productId, group);
    }

    for (const [productId, items] of byProduct) {
      if (await isCancelled()) throw new Error('Return and replacement update cancelled');
      const keys = new Set(items.map((item) => returnWriteKey(item.row)));
      if (keys.size > 1) {
        summary.conflictingReturnRowsRejected += items.length;
        for (const item of items) {
          errors.push(
            this.skuError(
              item.row,
              'Variants of this product request different return, replacement, or refund values',
              'Use the same return, replacement, and refund values for every SKU of this product',
            ),
          );
        }
        continue;
      }
      await this.applyProduct(productId, items, summary, errors, touchedProductIds);
    }

    await this.finish(uploadRefId, parsed.totalDataRows, errors, summary, touchedProductIds);
  }

  private async applyProduct(
    productId: string,
    items: ResolvedReturnRow[],
    summary: ICommerceJobSummary,
    errors: ICommerceRowError[],
    touchedProductIds: Set<string>,
  ): Promise<void> {
    const payload: IReturnWrite = {
      returnAllowed: items[0].row.returnAllowed,
      returnPolicy: items[0].row.returnPolicy,
      returnWindowDays: items[0].row.returnWindowDays,
      replaceAllowed: items[0].row.replaceAllowed,
      replaceWindowDays: items[0].row.replaceWindowDays,
      refundAllowed: items[0].row.refundAllowed,
    };
    const product = await this.productRepo
      .createQueryBuilder('p')
      .where('p.deletedAt IS NULL')
      .andWhere('p.id = :id', { id: productId })
      .getOne();
    if (!product) {
      for (const item of items) {
        summary.databaseFailures += 1;
        errors.push(this.skuError(item.row, 'Parent product was not found', 'Confirm the SKU still belongs to an active product'));
      }
      return;
    }

    if (!sameReturnWrite(product, payload)) {
      try {
        const result = await this.productRepo.update({ id: productId }, payload);
        if (!result.affected) throw new Error('Return update did not change the product');
        summary.productReturnRecordsUpdated += 1;
        touchedProductIds.add(productId);
      } catch (error) {
        summary.databaseFailures += items.length;
        for (const item of items) {
          errors.push(this.skuError(item.row, error instanceof Error ? error.message : String(error), 'Retry this product or contact support'));
        }
        return;
      }
    }

    for (const item of items) {
      if (sameReturnWrite(item.variant, payload)) {
        summary.variantsAlreadyCompliant += 1;
        continue;
      }
      try {
        const result = await this.variantRepo.update({ id: item.variant.id }, payload);
        if (!result.affected) throw new Error('Return update did not change the variant');
        summary.variantsUpdated += 1;
        touchedProductIds.add(productId);
      } catch (error) {
        summary.databaseFailures += 1;
        errors.push(this.skuError(item.row, error instanceof Error ? error.message : String(error), 'Retry this row or contact support'));
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
          `[BULK_RETURN_UPDATE] Cache invalidation failed for ${uploadRefId}. Product ref ids: ${cacheResult.refIds.join(', ')}. Run npm run cache:invalidate-products`,
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
          'bulk-return-updates/errors',
        );
      } catch (error) {
        this.logger.error(
          `[BULK_RETURN_UPDATE] Error workbook upload failed for ${uploadRefId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const successfulRows = summary.variantsUpdated + summary.productReturnRecordsUpdated;
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
      `[BULK_RETURN_UPDATE] Finished ${uploadRefId} status=${status} writes=${successfulRows} fail=${errors.length}`,
    );
  }

  private skuError(row: IParsedReturnRow, reason: string, suggestedFix: string): ICommerceRowError {
    return {
      rowNumber: row.rowNumber,
      sku: row.sku,
      column: 'SKU',
      invalidValue: row.sku,
      reason,
      suggestedFix,
    };
  }
}
