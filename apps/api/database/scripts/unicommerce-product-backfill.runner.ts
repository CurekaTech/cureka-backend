/**
 * One-time backfill: push all published products that are missing in Unicommerce.
 *
 * The script pages through every published product, enqueues a Unicommerce push
 * job for each one, and logs successes, failures, and a final summary.
 *
 * Safety guarantees:
 *  - Idempotent: safe to run multiple times. BullMQ deduplicates by jobId, and
 *    Unicommerce product push is an upsert, so re-pushing an already-synced product
 *    is harmless.
 *  - Only published products (status=PUBLISHED, publishedAt set) with at least one
 *    active variant are processed (reuses the existing Unicommerce catalog query).
 *  - Skips the enqueue when UNICOMMERCE_PRODUCT_PUSH_ENABLED != "true".
 *
 * Usage:
 *   npm run unicommerce:product-backfill
 *
 * Optional env overrides:
 *   BACKFILL_PAGE_SIZE=50   Products per page (default: 50)
 *   BACKFILL_DELAY_MS=200   Delay between pages in ms (default: 200)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { UnicommerceProductQueueService } from '@modules/unicommerce/services/unicommerce-product-queue.service';
import { ConfigService } from '@nestjs/config';

const PAGE_SIZE = parseInt(process.env['BACKFILL_PAGE_SIZE'] ?? '50', 10);
const DELAY_MS = parseInt(process.env['BACKFILL_DELAY_MS'] ?? '200', 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const configService = app.get(ConfigService);
    const unicommerceEnabled = configService.get<boolean>('unicommerceProduct.enabled');

    if (!unicommerceEnabled) {
      console.warn(
        '[unicommerce:product-backfill] UNICOMMERCE_PRODUCT_PUSH_ENABLED is not "true". ' +
          'Set the env var and re-run to actually push products. Exiting.',
      );
      return;
    }

    const productsRepository = app.get(ProductsRepository);
    const queueService = app.get(UnicommerceProductQueueService);

    let page = 1;
    let totalProcessed = 0;
    let totalEnqueued = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    console.log(
      `[unicommerce:product-backfill] Starting. pageSize=${PAGE_SIZE}, delayMs=${DELAY_MS}`,
    );

    while (true) {
      const products = await productsRepository.findPublishedProductsForUnicommerce({
        page,
        pageSize: PAGE_SIZE,
      });

      if (products.length === 0) {
        break;
      }

      console.log(
        `[unicommerce:product-backfill] Page ${page}: fetched ${products.length} published product(s).`,
      );

      for (const product of products) {
        totalProcessed += 1;

        if (!product.publishedAt) {
          console.warn(
            `[unicommerce:product-backfill] Skipping refId=${product.refId} (no publishedAt).`,
          );
          totalSkipped += 1;
          continue;
        }

        if (!product.variants?.length) {
          console.warn(
            `[unicommerce:product-backfill] Skipping refId=${product.refId} "${product.name}" (no variants loaded).`,
          );
          totalSkipped += 1;
          continue;
        }

        try {
          const version = product.updatedAt.getTime().toString();
          await queueService.enqueuePushProduct(product.refId, version);
          totalEnqueued += 1;
          console.log(
            `[unicommerce:product-backfill]   ✓ Enqueued refId=${product.refId} "${product.name}"`,
          );
        } catch (err) {
          totalFailed += 1;
          console.error(
            `[unicommerce:product-backfill]   ✗ Failed to enqueue refId=${product.refId} "${product.name}": ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      if (products.length < PAGE_SIZE) {
        break;
      }

      page += 1;
      if (DELAY_MS > 0) {
        await sleep(DELAY_MS);
      }
    }

    console.log(
      `\n[unicommerce:product-backfill] ━━━ Complete ━━━\n` +
        `  Total products processed : ${totalProcessed}\n` +
        `  Enqueued for sync        : ${totalEnqueued}\n` +
        `  Skipped (no variant/date): ${totalSkipped}\n` +
        `  Failed to enqueue        : ${totalFailed}\n` +
        `\n` +
        `  Unicommerce push jobs are now in the "${`unicommerce-products`}" BullMQ queue.\n` +
        `  Monitor the worker logs to track individual push success/failure.`,
    );

    if (totalFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error('[unicommerce:product-backfill] Fatal error:', error);
    process.exit(1);
  });
