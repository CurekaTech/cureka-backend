import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { loadWpImageLookup } from '../utils/bulk-upload-reference-lookup.util';
import {
  collectVariantMedia,
  extractMediaLocator,
  IMAGE_URL_COMPARISON_FILE_NAME,
  IMAGE_URL_COMPARISON_HEADERS,
  ImageUrlComparisonRow,
  joinImageUrls,
  resolveWpImageUrls,
} from '../utils/bulk-upload-image-url-comparison.util';

@Injectable()
export class BulkUploadImageComparisonExportService {
  private readonly logger = new Logger(BulkUploadImageComparisonExportService.name);

  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
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
        currentImageUrls: joinImageUrls(currentUrls),
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
    const resolved = await this.storageUrlEnricher.enrichReferences(
      entries,
      ([, ref]) => ref,
      (item, reference) => [item[0], reference?.url ?? ''] as const,
    );

    const urls = new Map<string, string>();
    for (const [key, url] of resolved) {
      if (url) urls.set(key, url);
    }
    return urls;
  }

  private async writeWorkbook(rows: ImageUrlComparisonRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cureka';
    const sheet = workbook.addWorksheet('Image URL Comparison', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: IMAGE_URL_COMPARISON_HEADERS[0], key: 'productId', width: 18 },
      { header: IMAGE_URL_COMPARISON_HEADERS[1], key: 'sku', width: 28 },
      { header: IMAGE_URL_COMPARISON_HEADERS[2], key: 'wpImageUrls', width: 60 },
      { header: IMAGE_URL_COMPARISON_HEADERS[3], key: 'currentImageUrls', width: 60 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    for (const row of rows) {
      sheet.addRow({
        productId: row.productId,
        sku: row.sku,
        wpImageUrls: row.wpImageUrls,
        currentImageUrls: row.currentImageUrls,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }
}
