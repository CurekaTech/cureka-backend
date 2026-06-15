/**
 * Reference listener for future products module.
 * Register in ProductsModule providers (not in controllers).
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';

@Injectable()
export class ProductCacheListenerExample {
  private readonly logger = new Logger(ProductCacheListenerExample.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async handleProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.products.listPattern(),
        CacheKeys.products.featuredPattern(),
        CacheKeys.products.detailPattern(event.refId),
      ],
    });

    this.logger.log(`Product cache invalidated (${event.action}) refId=${event.refId}`);
  }
}
