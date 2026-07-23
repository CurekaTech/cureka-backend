import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';
import { CategoryFiltersRepository } from '@modules/master/repositories/category-filters.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductType } from '../enums/product-type.enum';
import { buildUnifiedBulkUploadHeaders, buildCategoryFilterColumnHeader } from '../utils/bulk-upload-columns.util';
import {
  createBulkExportLookupContext,
  IBulkExportLookupContext,
  mapProductsToBulkExportRows,
} from '../utils/bulk-upload-export.mapper';
import { CSV_UTF8_BOM, formatCsvRow } from '../utils/bulk-upload-csv.util';
import { resolveProductBulkBatchSize } from '../constants/bulk-batch.constant';
@Injectable()
export class BulkUploadExportStreamService {
  private readonly logger = new Logger(BulkUploadExportStreamService.name);

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly configService: ConfigService,
  ) {}

  async resolveExportHeaders(): Promise<string[]> {
    const activeFilters = await this.categoryFiltersRepository.findAllActiveOrderedByName();
    const categoryFilterHeaders = activeFilters.map((filter) =>
      buildCategoryFilterColumnHeader(filter.name),
    );
    return buildUnifiedBulkUploadHeaders(categoryFilterHeaders);
  }

  async streamExportCsv(
    output: Writable,
    onProgress?: (processedProducts: number, totalProducts: number) => Promise<void> | void,
  ): Promise<{ totalProducts: number; totalRows: number }> {
    const batchSize = resolveProductBulkBatchSize(
      Number(this.configService.get('PRODUCT_BULK_BATCH_SIZE')),
    );
    const headers = await this.resolveExportHeaders();
    const totalProducts = await this.productsRepository.countForBulkExport();

    let bundleLookups: Pick<
      IBulkExportLookupContext,
      'variantSkuPriceLookup' | 'firstVariantSkuByProductId'
    > | null = null;
    const ensureBundleLookups = async () => {
      if (bundleLookups) {
        return bundleLookups;
      }
      const [variantSkuPriceLookup, firstVariantSkuByProductId] = await Promise.all([
        this.productsRepository.findVariantSkuExportLookup(),
        this.productsRepository.findFirstVariantSkuByProductId(),
      ]);
      bundleLookups = { variantSkuPriceLookup, firstVariantSkuByProductId };
      return bundleLookups;
    };

    let headerWritten = false;
    let processedProducts = 0;
    let totalRows = 0;
    let offset = 0;

    while (true) {
      const products = await this.productsRepository.findForBulkExportBatch(offset, batchSize);
      if (!products.length) {
        break;
      }

      if (!headerWritten) {
        await this.writeChunk(output, `${CSV_UTF8_BOM}${formatCsvRow(headers)}\r\n`);
        headerWritten = true;
      }

      const hasBundles = products.some((product) => product.productType === ProductType.BUNDLE);
      const bundleLookupData = hasBundles ? await ensureBundleLookups() : undefined;
      const lookupContext = createBulkExportLookupContext(products, bundleLookupData);
      const rows = mapProductsToBulkExportRows(products, headers, lookupContext);
      if (rows.length) {
        const csvChunk = rows.map((row) => `${formatCsvRow(row)}\r\n`).join('');
        await this.writeChunk(output, csvChunk);
        totalRows += rows.length;
      }

      processedProducts += products.length;
      await onProgress?.(processedProducts, totalProducts);
      offset += products.length;

      if (products.length < batchSize) {
        break;
      }
    }

    if (!headerWritten) {
      await this.writeChunk(output, `${CSV_UTF8_BOM}${formatCsvRow(headers)}\r\n`);
    }

    this.logger.log(
      `[BULK_EXPORT] Streamed ${totalRows} row(s) from ${processedProducts} product(s)`,
    );
    return { totalProducts: processedProducts, totalRows };
  }

  async buildExportCsvBuffer(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const collector = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });
    await this.streamExportCsv(collector);
    return Buffer.concat(chunks);
  }

  private writeChunk(output: Writable, chunk: string): Promise<void> {
    if (!chunk) {
      return Promise.resolve();
    }
    

    return new Promise((resolve, reject) => {
      const canContinue = output.write(chunk, (error) => {
        if (error) {
          reject(error);
        }
      });
      if (canContinue) {
        resolve();
        return;
      }
      output.once('drain', resolve);
      output.once('error', reject);
    });
  }
  async writeExportCsvToFile(
    outputPath: string,
    onProgress?: (processedProducts: number, totalProducts: number) => Promise<void> | void,
  ): Promise<{ totalProducts: number; totalRows: number }> {
    const output = createWriteStream(outputPath, { encoding: 'utf8' });
    try {
      return await this.streamExportCsv(output, onProgress);
    } finally {
      await new Promise<void>((resolve, reject) => {
        output.end((error?: Error | null) => (error ? reject(error) : resolve()));
      });
    }
  }
}
