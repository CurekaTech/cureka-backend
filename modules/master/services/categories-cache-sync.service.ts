import { Injectable } from '@nestjs/common';
import {
  CacheInvalidationService,
  CacheKeys,
  CacheModuleName,
  CacheTtlService,
} from '@packages/cache';
import { CategoriesService } from './categories.service';

/**
 * Keeps category tree/list Redis caches in sync without coupling controllers to Redis.
 */
@Injectable()
export class CategoriesCacheSyncService {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cacheTtl: CacheTtlService,
  ) {}

  async invalidateListCaches(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.categories.listPattern());
  }

  async syncTreeWriteThrough(): Promise<void> {
    await this.cacheInvalidation.refreshCache({
      key: CacheKeys.categories.tree(),
      loader: () => this.categoriesService.loadTreeUncached(),
      ttlSeconds: this.cacheTtl.forModule(CacheModuleName.CATEGORY),
    });
  }

  async invalidateHomepageCategoryHeaderCache(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(
      CacheKeys.homepage.categoryHeaderPattern(),
    );
  }
}
