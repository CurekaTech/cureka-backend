import { Injectable } from '@nestjs/common';
import { CacheInvalidationService, CacheKeys } from '@packages/cache';

@Injectable()
export class ExpertTalkCacheSyncService {
  constructor(private readonly cacheInvalidation: CacheInvalidationService) {}

  async invalidateHomepageExpertTalks(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(
      CacheKeys.homepage.curatedWellnessEssentialsPattern(),
    );
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.sectionsPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.expertTalks.listPattern());
  }
}
