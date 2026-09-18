import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { ProductUpdatedEvent, EVENTS } from '@packages/events';

@Injectable()
export class ProductCacheListener {
  private readonly logger = new Logger(ProductCacheListener.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async handleProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (process.env['BYPASS_PRODUCT_CACHE_LISTENER'] === 'true') {
      return;
    }
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.products.listPattern(),
        CacheKeys.products.detailPattern(),
        CacheKeys.publicProducts.listPattern(),
        CacheKeys.publicProducts.filtersPattern(),
        CacheKeys.publicProducts.filterBrandsPattern(),
        CacheKeys.publicProducts.variantSearchPattern(),
        CacheKeys.publicProducts.detailPattern(),
        ...CacheKeys.publicProducts.recommendationPatterns(),
        CacheKeys.publicListingContext.categoryPattern(),
        CacheKeys.publicBundles.listPattern(),
        CacheKeys.publicBundles.detailPattern(),
        CacheKeys.homepage.bestSellersPattern(),
        CacheKeys.homepage.sectionsPattern(),
      ],
      keys: [CacheKeys.products.detail(event.refId)],
    });
    this.logger.log(`Product cache invalidated (${event.action}) for refId=${event.refId}`);
  }
}
