import { Injectable } from '@nestjs/common';
import {
  CacheInvalidationService,
  CacheKeys,
  CacheModuleName,
  CacheTtlService,
} from '@packages/cache';
import { BannersService } from './banners.service';

/**
 * Keeps homepage banner Redis cache in sync when admin panel mutates banners.
 */
@Injectable()
export class BannersCacheSyncService {
  constructor(
    private readonly bannersService: BannersService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cacheTtl: CacheTtlService,
  ) {}

  async invalidateHomepageBanners(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.bannersPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.sectionsPattern());
  }

  /** Write-through: rebuild homepage bundle in Redis immediately after admin changes. */
  async syncHomepageBannersWriteThrough(): Promise<void> {
    await this.cacheInvalidation.refreshCache({
      key: CacheKeys.homepage.banners(),
      loader: () => this.bannersService.loadHomepageBannersUncached(),
      ttlSeconds: this.cacheTtl.forModule(CacheModuleName.HOMEPAGE),
    });
  }
}
