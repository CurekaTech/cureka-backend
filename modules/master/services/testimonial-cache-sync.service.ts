import { Injectable } from '@nestjs/common';
import { CacheInvalidationService, CacheKeys } from '@packages/cache';

@Injectable()
export class TestimonialCacheSyncService {
  constructor(private readonly cacheInvalidation: CacheInvalidationService) {}

  async invalidateHomepageTestimonials(): Promise<void> {
    // Exact keys work for in-memory cache; patterns cover Redis multi-variant keys.
    await this.cacheInvalidation.invalidateKeys([
      CacheKeys.homepage.curatedWellnessEssentials(),
      CacheKeys.homepage.sections('v5-all'),
    ]);
    await this.cacheInvalidation.invalidateByPattern(
      CacheKeys.homepage.curatedWellnessEssentialsPattern(),
    );
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.sectionsPattern());
  }
}
