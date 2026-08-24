import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { HomeSectionEntity } from '@modules/master/entities/home-section.entity';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { SupportArticleEntity } from '@modules/master/entities/support-article.entity';
import { CmsPageEntity } from '@modules/master/entities/cms-page.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { PublicSitemapController } from './controllers/public-sitemap.controller';
import { SitemapInvalidationListener } from './listeners/sitemap-invalidation.listener';
import { SitemapProcessor } from './processors/sitemap.processor';
import { SitemapDirtyService } from './services/sitemap-dirty.service';
import { SitemapGeneratorService } from './services/sitemap-generator.service';
import { SitemapQueryService } from './services/sitemap-query.service';
import { SitemapQueueService } from './services/sitemap-queue.service';
import { SitemapStorageService } from './services/sitemap-storage.service';
import { SitemapAuditRegistry } from './audit/sitemap-audit.registry';
import { SitemapAuditService } from './audit/sitemap-audit.service';
import {
  BlogAuditProvider,
  BrandAuditProvider,
  CategoryAuditProvider,
  CollectionAuditProvider,
  HealthConcernAuditProvider,
  ProductAuditProvider,
  StaticAuditProvider,
  WellnessGoalAuditProvider,
} from './audit/providers';

@Module({
  imports: [
    UploadsModule,
    QueueModule.registerQueue(QUEUE_NAMES.SITEMAP),
    TypeOrmModule.forFeature([
      ProductEntity,
      CategoryEntity,
      BrandEntity,
      HealthConcernEntity,
      WellnessGoalEntity,
      HomeSectionEntity,
      BlogPostEntity,
      SupportArticleEntity,
      CmsPageEntity,
    ]),
  ],
  controllers: [PublicSitemapController],
  providers: [
    SitemapQueryService,
    SitemapStorageService,
    SitemapDirtyService,
    SitemapQueueService,
    SitemapGeneratorService,
    SitemapProcessor,
    SitemapInvalidationListener,
    SitemapAuditRegistry,
    SitemapAuditService,
    CategoryAuditProvider,
    BrandAuditProvider,
    HealthConcernAuditProvider,
    WellnessGoalAuditProvider,
    CollectionAuditProvider,
    ProductAuditProvider,
    BlogAuditProvider,
    StaticAuditProvider,
  ],
  exports: [SitemapQueueService, SitemapGeneratorService, SitemapAuditService],
})
export class SitemapModule {}
