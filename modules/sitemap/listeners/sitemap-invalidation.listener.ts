import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  BlogPostUpdatedEvent,
  BrandUpdatedEvent,
  CategoryUpdatedEvent,
  CmsPageUpdatedEvent,
  EVENTS,
  HealthConcernUpdatedEvent,
  HomeSectionUpdatedEvent,
  ProductUpdatedEvent,
  SupportArticleUpdatedEvent,
  WellnessGoalUpdatedEvent,
} from '@packages/events';
import { SitemapGroup } from '../config/sitemap-groups';
import { SitemapQueueService } from '../services/sitemap-queue.service';

@Injectable()
export class SitemapInvalidationListener {
  private readonly logger = new Logger(SitemapInvalidationListener.name);

  constructor(
    private readonly queueService: SitemapQueueService,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(_event: ProductUpdatedEvent): Promise<void> {
    if (process.env['BYPASS_PRODUCT_SIDE_EFFECT_LISTENERS'] === 'true') return;
    await this.enqueue('products');
  }

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async onCategoryUpdated(_event: CategoryUpdatedEvent): Promise<void> {
    await this.enqueue('categories');
    await this.enqueue('products');
  }

  @OnEvent(EVENTS.BRAND_UPDATED)
  async onBrandUpdated(_event: BrandUpdatedEvent): Promise<void> {
    await this.enqueue('brands');
  }

  @OnEvent(EVENTS.HEALTH_CONCERN_UPDATED)
  async onHealthConcernUpdated(_event: HealthConcernUpdatedEvent): Promise<void> {
    await this.enqueue('health-concerns');
  }

  @OnEvent(EVENTS.WELLNESS_GOAL_UPDATED)
  async onWellnessGoalUpdated(_event: WellnessGoalUpdatedEvent): Promise<void> {
    await this.enqueue('wellness-goals');
  }

  @OnEvent(EVENTS.HOME_SECTION_UPDATED)
  async onHomeSectionUpdated(_event: HomeSectionUpdatedEvent): Promise<void> {
    await this.enqueue('collections');
  }

  @OnEvent(EVENTS.BLOG_POST_UPDATED)
  async onBlogPostUpdated(_event: BlogPostUpdatedEvent): Promise<void> {
    await this.enqueue('blogs');
  }

  @OnEvent(EVENTS.CMS_PAGE_UPDATED)
  async onCmsPageUpdated(_event: CmsPageUpdatedEvent): Promise<void> {
    await this.enqueue('cms');
  }

  @OnEvent(EVENTS.SUPPORT_ARTICLE_UPDATED)
  async onSupportArticleUpdated(_event: SupportArticleUpdatedEvent): Promise<void> {
    await this.enqueue('support');
  }

  private async enqueue(group: SitemapGroup): Promise<void> {
    if (!this.configService.get<boolean>('sitemap.enabled')) return;
    this.logger.debug({ group }, 'Marking sitemap group dirty');
    await this.queueService.enqueueGroup(group);
  }
}
