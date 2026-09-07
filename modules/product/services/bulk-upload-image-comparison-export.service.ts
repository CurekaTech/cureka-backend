import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { StorageService } from '@packages/storage';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { loadWpImageLookup } from '../utils/bulk-upload-reference-lookup.util';
import {
  collectVariantMedia,
  currentImageColumnHeader,
  extractMediaLocator,
  IMAGE_URL_COMPARISON_FILE_NAME,
  IMAGE_URL_COMPARISON_HEADERS,
  ImageUrlComparisonRow,
  resolveWpImageUrls,
} from '../utils/bulk-upload-image-url-comparison.util';

@Injectable()
export class BulkUploadImageComparisonExportService {
  private readonly logger = new Logger(BulkUploadImageComparisonExportService.name);

  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async buildWorkbookBuffer(): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const variants = await this.productVariantsRepository.findAllForImageUrlComparison();
    const media = await this.productVariantsRepository.findImageMediaByProductIds(
      variants.map((variant) => variant.productId),
    );
    const mediaByProductId = this.groupMediaByProductId(media);
    const wpLookup = await loadWpImageLookup();

    this.logger.log(
      {
        variantCount: variants.length,
        mediaCount: media.length,
        wpLookupPath: wpLookup.path,
        wpLookupLoaded: wpLookup.loaded,
        wpSkuMatches: wpLookup.bySku.size,
        wpProductIdMatches: wpLookup.byProductId.size,
      },
      '[BULK_EXPORT] Building product image URL comparison workbook',
    );

    const currentUrlByLocator = await this.resolveCurrentImageUrls(media);
    const rows: ImageUrlComparisonRow[] = variants.map((variant) => {
      const variantMedia = collectVariantMedia(variant.id, variant.productId, mediaByProductId);
      const currentUrls: string[] = [];
      for (const item of variantMedia) {
        const locator = extractMediaLocator(item.url);
        if (!locator) continue;
        if (locator.type === 'absolute') {
          currentUrls.push(locator.url);
          continue;
        }
        const key = typeof locator.ref === 'string' ? locator.ref : locator.ref.key;
        const resolved = currentUrlByLocator.get(key);
        if (resolved) currentUrls.push(resolved);
      }

      return {
        productId: variant.externalProductId?.trim() ?? '',
        sku: variant.sku?.trim() ?? '',
        wpImageUrls: resolveWpImageUrls(
          variant.sku,
          variant.externalProductId,
          wpLookup.bySku,
          wpLookup.byProductId,
        ),
        currentImageUrls: currentUrls,
      };
    });

    const fileBuffer = await this.writeWorkbook(rows);
    return { fileName: IMAGE_URL_COMPARISON_FILE_NAME, fileBuffer };
  }

  getExportTimeoutMs(): number {
    const configuredTimeout = Number(
      this.configService.get('PRODUCT_BULK_EXPORT_TIMEOUT_MS') ?? 15 * 60 * 1000,
    );
    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 15 * 60 * 1000;
  }

  private groupMediaByProductId(
    media: ProductMediaEntity[],
  ): Map<string, ProductMediaEntity[]> {
    const grouped = new Map<string, ProductMediaEntity[]>();
    for (const item of media) {
      const list = grouped.get(item.productId) ?? [];
      list.push(item);
      grouped.set(item.productId, list);
    }
    return grouped;
  }

  private async resolveCurrentImageUrls(
    media: ProductMediaEntity[],
  ): Promise<Map<string, string>> {
    const storageRefs = new Map<string, string | { key: string; name: string }>();
    for (const item of media) {
      const locator = extractMediaLocator(item.url);
      if (locator?.type !== 'storage') continue;
      const key = typeof locator.ref === 'string' ? locator.ref : locator.ref.key;
      if (!key || storageRefs.has(key)) continue;
      storageRefs.set(key, locator.ref);
    }

    const entries = [...storageRefs.entries()];
    const urls = new Map<string, string>();
    const concurrency = 20;
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (cursor < entries.length) {
        const index = cursor;
        cursor += 1;
        const entry = entries[index];
        if (!entry) return;
        const [key, ref] = entry;
        const url = await this.storageService.resolveAccessibleUrl(ref, { forceRefresh: true });
        if (url) urls.set(key, url);
      }
    });
    await Promise.all(workers);
    return urls;
  }

  private async writeWorkbook(rows: ImageUrlComparisonRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cureka';
    const maxCurrentImages = rows.reduce(
      (max, row) => Math.max(max, row.currentImageUrls.length),
      1,
    );
    const sheet = workbook.addWorksheet('Image URL Comparison', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const currentImageHeaders = Array.from({ length: maxCurrentImages }, (_, index) =>
      currentImageColumnHeader(index + 1),
    );
    sheet.columns = [
      { header: IMAGE_URL_COMPARISON_HEADERS[0], key: 'productId', width: 18 },
      { header: IMAGE_URL_COMPARISON_HEADERS[1], key: 'sku', width: 28 },
      { header: IMAGE_URL_COMPARISON_HEADERS[2], key: 'wpImageUrls', width: 60 },
      ...currentImageHeaders.map((header, index) => ({
        header,
        key: `currentImage${index + 1}`,
        width: 60,
      })),
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    for (const row of rows) {
      const values: Record<string, string> = {
        productId: row.productId,
        sku: row.sku,
        wpImageUrls: row.wpImageUrls,
      };
      for (let index = 0; index < maxCurrentImages; index += 1) {
        values[`currentImage${index + 1}`] = row.currentImageUrls[index] ?? '';
      }
      sheet.addRow(values);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }
}
