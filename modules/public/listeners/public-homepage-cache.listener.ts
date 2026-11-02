import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import {
  BrandUpdatedEvent,
  CategoryUpdatedEvent,
  CmsPageUpdatedEvent,
  EVENTS,
} from '@packages/events';
import { HomepageService } from '../services/homepage.service';

@Injectable()
export class PublicHomepageCacheListener {
  private readonly logger = new Logger(PublicHomepageCacheListener.name);

  constructor(
    private readonly homepageService: HomepageService,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  @OnEvent(EVENTS.CMS_PAGE_UPDATED)
  async onCmsPageUpdated(_event: CmsPageUpdatedEvent): Promise<void> {
    this.logger.debug('Invalidating public CMS pages + footer nav cache');
    await this.homepageService.invalidatePublicCmsPagesCache();
  }

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async onCategoryUpdated(_event: CategoryUpdatedEvent): Promise<void> {
    // Invalidate Redis first, then drop process L1. Clearing L1 before Redis
    // lets a concurrent request refill L1 from the stale header tree for ~60s —
    // which looked like "Add to Header" needing a reorder to take effect.
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.categoryHeaderPattern(),
        CacheKeys.homepage.footerNavPattern(),
      ],
    });
    this.homepageService.invalidateHeaderTreeLocalCache();
    this.homepageService.invalidateFooterNavLocalCache();
  }

  @OnEvent(EVENTS.BRAND_UPDATED)
  async onBrandUpdated(_event: BrandUpdatedEvent): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.homepage.footerNavPattern()],
    });
    this.homepageService.invalidateFooterNavLocalCache();
  }
}
