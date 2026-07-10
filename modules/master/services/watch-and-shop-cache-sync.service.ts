import { Injectable } from '@nestjs/common';
import { CacheInvalidationService, CacheKeys } from '@packages/cache';
import { WatchAndShopService } from './watch-and-shop.service';

/**
 * Keeps homepage Watch & Shop Redis cache in sync when admin panel mutates items.
 */
@Injectable()
export class WatchAndShopCacheSyncService {
  constructor(
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async invalidateHomepageWatchAndShop(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.watchAndShopPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.sectionsPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.watchAndShop.listPattern());
  }
}
