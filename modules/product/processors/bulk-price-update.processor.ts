import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { CacheKeys, CacheStrategyService, RedisConnectionService } from '@packages/cache';
import { StorageService } from '@packages/storage';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { BulkUploadsRepository } from '../repositories/bulk-uploads.repository';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import {
  BulkPriceUpdateParserService,
  IPriceRowError,
} from '../services/bulk-price-update-parser.service';
import {
  isBulkPriceUpdateCancelled,
  releaseBulkPriceUpdateLock,
  renewBulkPriceUpdateLock,
} from '../utils/bulk-price-update-lock.util';

interface BulkPriceUpdateJobData {
  uploadRefId: string;
  fileUrl: string;
  lockToken?: string;
  lockTtlMs?: number;
}

const calcDiscountPercent = (mrp: number, selling: number): string | null => {
  if (mrp <= 0) return null;
  const pct = ((mrp - selling) / mrp) * 100;
  return (Math.round(pct * 100) / 100).toFixed(2);
};

@Processor('bulk-price-update', { concurrency: 1 })
export class BulkPriceUpdateProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkPriceUpdateProcessor.name);

  constructor(
    private readonly repository: BulkUploadsRepository,
    private readonly parser: BulkPriceUpdateParserService,
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

  async process(job: Job<BulkPriceUpdateJobData>): Promise<void> {
    const { uploadRefId, fileUrl, lockToken, lockTtlMs } = job.data;
    this.logger.log(`[BULK_PRICE_UPDATE] Starting job ${uploadRefId}`);

    const redis = await this.redisConnection.getConnectedClient();
    let renewTimer: NodeJS.Timeout | null = null;
    const tempDir = join(process.cwd(), 'tmp', 'bulk-price-updates');
    const tempFilePath = join(tempDir, `${uploadRefId}-${Date.now()}`);

    try {
      await this.repository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.VALIDATING,
      });

      if (redis && lockToken && lockTtlMs) {
        const renewEveryMs = Math.max(30_000, Math.floor(lockTtlMs / 3));
        renewTimer = setInterval(() => {
          void renewBulkPriceUpdateLock(redis, lockToken, lockTtlMs).catch((err) => {
            this.logger.warn(
              `[BULK_PRICE_UPDATE] Failed to renew lock for ${uploadRefId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        }, renewEveryMs);
      }

      if (await isBulkPriceUpdateCancelled(redis, uploadRefId)) {
        throw new Error('Bulk price update cancelled');
      }

      await mkdir(tempDir, { recursive: true });
      const readStream = await this.storageService.createReadStream(fileUrl);
      await pipeline(readStream, createWriteStream(tempFilePath));

      await this.repository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.PROCESSING,
      });

      const { rows, errors } = await this.parser.parseFile(tempFilePath);
      const allErrors: IPriceRowError[] = [...errors];
      let successfulRows = 0;
      let processedRows = errors.length;
      const touchedProductIds = new Set<string>();

      await this.repository.updateFieldsByRefId(uploadRefId, {
        totalRows: rows.length + errors.length,
        processedRows,
        successfulRows: 0,
        failedRows: errors.length,
        errorSummary: allErrors,
      });

      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        if (await isBulkPriceUpdateCancelled(redis, uploadRefId)) {
          throw new Error('Bulk price update cancelled');
        }

        const chunk = rows.slice(i, i + chunkSize);
        for (const row of chunk) {
          processedRows += 1;
          try {
            const variant = await this.variantRepo
              .createQueryBuilder('v')
              .where('v.deleted_at IS NULL')
              .andWhere('TRIM(v.sku) = TRIM(:sku)', { sku: row.sku })
              .getOne();

            if (!variant) {
              allErrors.push({
                rowNumber: row.rowNumber,
                sku: row.sku,
                column: 'SKU',
                invalidValue: row.sku,
                reason: 'SKU not found in product variants',
                suggestedFix: 'Use an existing variant SKU',
              });
              continue;
            }

            if (row.productId) {
              const expected = (variant.externalProductId ?? '').trim();
              if (!expected || expected.toLowerCase() !== row.productId.trim().toLowerCase()) {
                allErrors.push({
                  rowNumber: row.rowNumber,
                  sku: row.sku,
                  column: 'Product Id',
                  invalidValue: row.productId,
                  reason: expected
                    ? `Product Id does not match SKU (variant has "${expected}")`
                    : 'Variant has no Product Id; omit Product Id or set it on the variant first',
                  suggestedFix: 'Provide the Product Id that belongs to this SKU, or leave it blank',
                });
                continue;
              }
            }

            const discountPercentage = calcDiscountPercent(row.mrp, row.sellingPrice);
            await this.variantRepo.update(
              { id: variant.id },
              {
                mrp: row.mrp.toFixed(2),
                sellingPrice: row.sellingPrice.toFixed(2),
                discountPercentage,
              },
            );
            touchedProductIds.add(variant.productId);
            successfulRows += 1;
          } catch (rowError) {
            allErrors.push({
              rowNumber: row.rowNumber,
              sku: row.sku,
              column: 'SYSTEM',
              invalidValue: 'N/A',
              reason: rowError instanceof Error ? rowError.message : String(rowError),
              suggestedFix: 'Retry this row or contact support',
            });
          }
        }

        await this.repository.updateFieldsByRefId(uploadRefId, {
          processedRows,
          successfulRows,
          failedRows: allErrors.length,
          errorSummary: allErrors.slice(0, 500),
        });
      }

      if (touchedProductIds.size) {
        const products = await this.productRepo
          .createQueryBuilder('p')
          .select(['p.id', 'p.refId'])
          .where('p.id IN (:...ids)', { ids: [...touchedProductIds] })
          .getMany();

        await this.cacheStrategy.invalidateOnly({
          keys: products.map((p) => CacheKeys.products.detail(p.refId)),
          patterns: [
            CacheKeys.products.listPattern(),
            CacheKeys.publicProducts.listPattern(),
            CacheKeys.publicProducts.variantSearchPattern(),
            CacheKeys.publicProducts.detailPattern(),
          ],
        });
      }

      const failedRows = allErrors.length;
      const totalRows = successfulRows + failedRows;
      let status = BulkUploadStatus.COMPLETED;
      if (successfulRows === 0 && failedRows > 0) status = BulkUploadStatus.FAILED;
      else if (successfulRows > 0 && failedRows > 0) status = BulkUploadStatus.PARTIAL_SUCCESS;

      await this.repository.updateFieldsByRefId(uploadRefId, {
        status,
        totalRows,
        processedRows: totalRows,
        successfulRows,
        failedRows,
        errorSummary: allErrors.slice(0, 1000),
        completedAt: new Date(),
      });
      this.logger.log(
        `[BULK_PRICE_UPDATE] Finished ${uploadRefId} status=${status} ok=${successfulRows} fail=${failedRows}`,
      );
    } catch (error) {
      this.logger.error(
        `[BULK_PRICE_UPDATE] Job ${uploadRefId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.repository.updateFieldsByRefId(uploadRefId, {
        status: BulkUploadStatus.FAILED,
        completedAt: new Date(),
        errorSummary: [
          {
            rowNumber: 0,
            sku: 'SYSTEM',
            column: 'Processor',
            invalidValue: 'N/A',
            reason: error instanceof Error ? error.message : String(error),
            suggestedFix: 'Fix the file and re-upload',
          },
        ],
      });
    } finally {
      if (renewTimer) clearInterval(renewTimer);
      try {
        await unlink(tempFilePath);
      } catch {
        // ignore
      }
      if (redis && lockToken) {
        await releaseBulkPriceUpdateLock(redis, lockToken);
      }
    }
  }
}
