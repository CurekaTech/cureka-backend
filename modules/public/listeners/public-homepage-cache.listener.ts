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
    this.homepageService.invalidateHeaderTreeLocalCache();
    this.homepageService.invalidateFooterNavLocalCache();
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.homepage.footerNavPattern()],
    });
  }

  @OnEvent(EVENTS.BRAND_UPDATED)
  async onBrandUpdated(_event: BrandUpdatedEvent): Promise<void> {
    this.homepageService.invalidateFooterNavLocalCache();
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.homepage.footerNavPattern()],
    });
  }
}
