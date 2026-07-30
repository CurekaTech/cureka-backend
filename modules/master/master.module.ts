import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';

// ── Master entities ──────────────────────────────────────────────────────────
import { AttributeEntity } from './entities/attribute.entity';
import { BrandEntity } from './entities/brand.entity';
import { CategoryEntity } from './entities/category.entity';
import { CountryEntity } from './entities/country.entity';
import { StateEntity } from './entities/state.entity';
import { CityEntity } from './entities/city.entity';
import { HealthConcernEntity } from './entities/health-concern.entity';
import { AgeGroupEntity } from './entities/age-group.entity';
import { ManufacturerEntity } from './entities/manufacturer.entity';
import { BannerEntity } from './entities/banner.entity';
import { WatchAndShopItemEntity } from './entities/watch-and-shop-item.entity';
import { ExpertTalkItemEntity } from './entities/expert-talk-item.entity';
import { TestimonialEntity } from './entities/testimonial.entity';
import { CmsPageEntity } from './entities/cms-page.entity';
import { ImporterEntity } from './entities/importer.entity';
import { PackerEntity } from './entities/packer.entity';
import { ProductNatureEntity } from './entities/product-nature.entity';
import { SubscriptionFrequencyEntity } from './entities/subscription-frequency.entity';
import { WellnessGoalEntity } from './entities/wellness-goal.entity';
import { ReasonMasterEntity } from './entities/reason-master.entity';
import { CategoryFilterEntity } from './entities/category-filter.entity';
import { CouponEntity } from './entities/coupon.entity';
import { CouponBrandMappingEntity } from './entities/coupon-brand-mapping.entity';
import { CouponCategoryMappingEntity } from './entities/coupon-category-mapping.entity';
import { CouponProductMappingEntity } from './entities/coupon-product-mapping.entity';
import { HomeSectionEntity } from './entities/home-section.entity';
import { UnitEntity } from './entities/unit.entity';

// ── Audit entities ───────────────────────────────────────────────────────────
import { AuditLogEntity } from './entities/audit-log.entity';

// ── Blog entities ────────────────────────────────────────────────────────────
import { BlogCategoryEntity } from './entities/blog-category.entity';
import { BlogPostEntity } from './entities/blog-post.entity';
import { BlogPostProductEntity } from './entities/blog-post-product.entity';
import { BlogCommentEntity } from './entities/blog-comment.entity';

// ── Support entities ─────────────────────────────────────────────────────────
import { SupportCategoryEntity } from './entities/support-category.entity';
import { SupportArticleEntity } from './entities/support-article.entity';
import { SupportFaqEntity } from './entities/support-faq.entity';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { TicketMessageEntity } from './entities/ticket-message.entity';
import { SupportNotificationEntity } from './entities/support-notification.entity';

// ── Product entities needed for master/blog relations ────────────────────────
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductHealthConcernEntity } from '@modules/product/entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '@modules/product/entities/product-wellness-goal.entity';
import { ProductAttributeMappingEntity } from '@modules/product/entities/product-attribute-mapping.entity';
import { VariantAttributeValueEntity } from '@modules/product/entities/variant-attribute-value.entity';

// ── External entities required by support ────────────────────────────────────
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';

// ── Master repositories ──────────────────────────────────────────────────────
import { AttributesRepository } from './repositories/attributes.repository';
import { BrandsRepository } from './repositories/brands.repository';
import { CategoriesRepository } from './repositories/categories.repository';
import { CountriesRepository } from './repositories/countries.repository';
import { StatesRepository } from './repositories/states.repository';
import { CitiesRepository } from './repositories/cities.repository';
import { HealthConcernsRepository } from './repositories/health-concerns.repository';
import { AgeGroupsRepository } from './repositories/age-groups.repository';
import { ManufacturersRepository } from './repositories/manufacturers.repository';
import { BannersRepository } from './repositories/banners.repository';
import { WatchAndShopRepository } from './repositories/watch-and-shop.repository';
import { ExpertTalkRepository } from './repositories/expert-talk.repository';
import { TestimonialRepository } from './repositories/testimonial.repository';
import { CmsPagesRepository } from './repositories/cms-pages.repository';
import { ImportersRepository } from './repositories/importers.repository';
import { PackersRepository } from './repositories/packers.repository';
import { ProductNaturesRepository } from './repositories/product-natures.repository';
import { SubscriptionFrequenciesRepository } from './repositories/subscription-frequencies.repository';
import { WellnessGoalsRepository } from './repositories/wellness-goals.repository';
import { ReasonMastersRepository } from './repositories/reason-masters.repository';
import { CategoryFiltersRepository } from './repositories/category-filters.repository';
import { CouponsRepository } from './repositories/coupons.repository';
import { CouponApplicabilityRepository } from './repositories/coupon-applicability.repository';
import { HomeSectionsRepository } from './repositories/home-sections.repository';
import { UnitsRepository } from './repositories/units.repository';
import { MasterUsageRepository } from './repositories/master-usage.repository';

// ── Audit repositories ───────────────────────────────────────────────────────
import { AuditLogsRepository } from './repositories/audit-logs.repository';

// ── Blog repositories ────────────────────────────────────────────────────────
import { BlogCategoriesRepository } from './repositories/blog-categories.repository';
import { BlogPostsRepository } from './repositories/blog-posts.repository';
import { BlogPostProductsRepository } from './repositories/blog-post-products.repository';
import { BlogCommentsRepository } from './repositories/blog-comments.repository';

// ── Support repositories ─────────────────────────────────────────────────────
import { SupportCategoriesRepository } from './repositories/support-categories.repository';
import { SupportArticlesRepository } from './repositories/support-articles.repository';
import { SupportFaqsRepository } from './repositories/support-faqs.repository';
import { SupportTicketsRepository } from './repositories/support-tickets.repository';
import { TicketMessagesRepository } from './repositories/ticket-messages.repository';
import { SupportNotificationsRepository } from './repositories/support-notifications.repository';

// ── Master services ──────────────────────────────────────────────────────────
import { AttributesService } from './services/attributes.service';
import { BrandsService } from './services/brands.service';
import { CategoriesService } from './services/categories.service';
import { CountriesService } from './services/countries.service';
import { StatesService } from './services/states.service';
import { CitiesService } from './services/cities.service';
import { HealthConcernsService } from './services/health-concerns.service';
import { AgeGroupsService } from './services/age-groups.service';
import { ManufacturersService } from './services/manufacturers.service';
import { BannersService } from './services/banners.service';
import { BannersCacheSyncService } from './services/banners-cache-sync.service';
import { WatchAndShopService } from './services/watch-and-shop.service';
import { WatchAndShopCacheSyncService } from './services/watch-and-shop-cache-sync.service';
import { ExpertTalkService } from './services/expert-talk.service';
import { ExpertTalkCacheSyncService } from './services/expert-talk-cache-sync.service';
import { TestimonialService } from './services/testimonial.service';
import { CmsPagesService } from './services/cms-pages.service';
import { TestimonialCacheSyncService } from './services/testimonial-cache-sync.service';
import { ImportersService } from './services/importers.service';
import { PackersService } from './services/packers.service';
import { ProductNaturesService } from './services/product-natures.service';
import { SubscriptionFrequenciesService } from './services/subscription-frequencies.service';
import { WellnessGoalsService } from './services/wellness-goals.service';
import { ReasonMastersService } from './services/reason-masters.service';
import { CategoryFiltersService } from './services/category-filters.service';
import { CouponsService } from './services/coupons.service';
import { HomeSectionsService } from './services/home-sections.service';
import { UnitsService } from './services/units.service';
import { CategoriesCacheSyncService } from './services/categories-cache-sync.service';
import { MasterDeletionGuardService } from './services/master-deletion-guard.service';

// ── Audit service ────────────────────────────────────────────────────────────
import { AuditService } from './services/audit.service';

// ── Blog services ────────────────────────────────────────────────────────────
import { BlogCategoriesService } from './services/blog-categories.service';
import { BlogPostsService } from './services/blog-posts.service';
import { BlogCommentsService } from './services/blog-comments.service';

// ── Support services ─────────────────────────────────────────────────────────
import { SupportCategoriesService } from './services/support-categories.service';
import { SupportArticlesService } from './services/support-articles.service';
import { SupportFaqsService } from './services/support-faqs.service';
import { SupportTicketsService } from './services/support-tickets.service';
import { SupportTicketNumberService } from './services/support-ticket-number.service';
import { OrderSupportReasonsService } from './services/order-support-reasons.service';

// ── Master controllers ───────────────────────────────────────────────────────
import { AttributesController } from './controllers/attributes.controller';
import { BrandsController } from './controllers/brands.controller';
import { CategoriesController } from './controllers/categories.controller';
import { CountriesController } from './controllers/countries.controller';
import { StatesController } from './controllers/states.controller';
import { CitiesController } from './controllers/cities.controller';
import { HealthConcernsController } from './controllers/health-concerns.controller';
import { AgeGroupsController } from './controllers/age-groups.controller';
import { ManufacturersController } from './controllers/manufacturers.controller';
import { BannersController } from './controllers/banners.controller';
import { WatchAndShopController } from './controllers/watch-and-shop.controller';
import { ExpertTalkController } from './controllers/expert-talk.controller';
import { TestimonialController } from './controllers/testimonial.controller';
import { CmsPagesController } from './controllers/cms-pages.controller';
import { PublicCmsPagesController } from './controllers/public-cms-pages.controller';
import { ImportersController } from './controllers/importers.controller';
import { PackersController } from './controllers/packers.controller';
import { ProductNaturesController } from './controllers/product-natures.controller';
import { SubscriptionFrequenciesController } from './controllers/subscription-frequencies.controller';
import { WellnessGoalsController } from './controllers/wellness-goals.controller';
import { ReasonMastersController } from './controllers/reason-masters.controller';
import { CategoryFiltersController } from './controllers/category-filters.controller';
import { CouponsController } from './controllers/coupons.controller';
import { HomeSectionsController } from './controllers/home-sections.controller';
import { UnitsController } from './controllers/units.controller';

// ── Blog controllers (routes: blog/*, public/blog) ──────────────────────────
import { AdminBlogCategoriesController } from './controllers/admin-blog-categories.controller';
import { AdminBlogPostsController } from './controllers/admin-blog-posts.controller';
import { AdminBlogCommentsController } from './controllers/admin-blog-comments.controller';
import { PublicBlogController } from './controllers/public-blog.controller';

// ── Support controllers (routes: support/*, admin/support/*, public/support) ─
import { AdminSupportCategoriesController } from './controllers/admin-support-categories.controller';
import { AdminSupportArticlesController } from './controllers/admin-support-articles.controller';
import { AdminSupportFaqsController } from './controllers/admin-support-faqs.controller';
import { AdminSupportTicketsController } from './controllers/admin-support-tickets.controller';
import { PublicSupportController } from './controllers/public-support.controller';
import { UserSupportTicketsController } from './controllers/user-support-tickets.controller';

// ── Listeners ────────────────────────────────────────────────────────────────
import { AttributeCacheListener } from './listeners/attribute-cache.listener';
import { CategoryCacheListener } from './listeners/category-cache.listener';
import { BannerCacheListener } from './listeners/banner-cache.listener';
import { WatchAndShopCacheListener } from './listeners/watch-and-shop-cache.listener';
import { ExpertTalkCacheListener } from './listeners/expert-talk-cache.listener';
import { TestimonialCacheListener } from './listeners/testimonial-cache.listener';
import { ImporterCacheListener } from './listeners/importer-cache.listener';
import { PackerCacheListener } from './listeners/packer-cache.listener';
import { SubscriptionFrequencyCacheListener } from './listeners/subscription-frequency-cache.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // ── Master ──────────────────────────────────────────────────────────
      AttributeEntity,
      BrandEntity,
      CategoryEntity,
      CountryEntity,
      StateEntity,
      CityEntity,
      HealthConcernEntity,
      AgeGroupEntity,
      ManufacturerEntity,
      BannerEntity,
      WatchAndShopItemEntity,
      ExpertTalkItemEntity,
      TestimonialEntity,
      CmsPageEntity,
      ImporterEntity,
      PackerEntity,
      ProductNatureEntity,
      SubscriptionFrequencyEntity,
      WellnessGoalEntity,
      ReasonMasterEntity,
      CategoryFilterEntity,
      CouponEntity,
      CouponCategoryMappingEntity,
      CouponProductMappingEntity,
      CouponBrandMappingEntity,
      HomeSectionEntity,
      UnitEntity,
      // ── Product (needed for master deletion-guard and home-sections) ────
      ProductEntity,
      ProductHealthConcernEntity,
      ProductWellnessGoalEntity,
      ProductAttributeMappingEntity,
      VariantAttributeValueEntity,
      // ── Audit ────────────────────────────────────────────────────────────
      AuditLogEntity,
      // ── Blog ─────────────────────────────────────────────────────────────
      BlogCategoryEntity,
      BlogPostEntity,
      BlogPostProductEntity,
      BlogCommentEntity,
      // ── Support ──────────────────────────────────────────────────────────
      SupportCategoryEntity,
      SupportArticleEntity,
      SupportFaqEntity,
      SupportTicketEntity,
      TicketMessageEntity,
      SupportNotificationEntity,
      // ── External entities needed for join resolution ──────────────────────
      AdminUserEntity,
      OrderEntity,
    ]),
    UploadsModule,
  ],
  controllers: [
    // ── Master ──────────────────────────────────────────────────────────────
    AttributesController,
    BrandsController,
    CategoriesController,
    CountriesController,
    StatesController,
    CitiesController,
    HealthConcernsController,
    AgeGroupsController,
    ManufacturersController,
    BannersController,
    WatchAndShopController,
    ExpertTalkController,
    TestimonialController,
    CmsPagesController,
    PublicCmsPagesController,
    ImportersController,
    PackersController,
    ProductNaturesController,
    SubscriptionFrequenciesController,
    WellnessGoalsController,
    ReasonMastersController,
    CategoryFiltersController,
    CouponsController,
    HomeSectionsController,
    UnitsController,
    // ── Blog (routes unchanged: blog/*, public/blog) ─────────────────────
    AdminBlogCategoriesController,
    AdminBlogPostsController,
    AdminBlogCommentsController,
    PublicBlogController,
    // ── Support (routes unchanged: support/*, admin/support/*, public/support)
    AdminSupportCategoriesController,
    AdminSupportArticlesController,
    AdminSupportFaqsController,
    AdminSupportTicketsController,
    PublicSupportController,
    UserSupportTicketsController,
  ],
  providers: [
    // ── Master ──────────────────────────────────────────────────────────────
    AttributesService,
    AttributesRepository,
    BrandsService,
    BrandsRepository,
    CategoriesService,
    CategoriesRepository,
    CountriesService,
    CountriesRepository,
    StatesService,
    StatesRepository,
    CitiesService,
    CitiesRepository,
    HealthConcernsService,
    HealthConcernsRepository,
    AgeGroupsService,
    AgeGroupsRepository,
    ManufacturersService,
    ManufacturersRepository,
    BannersService,
    BannersRepository,
    BannersCacheSyncService,
    WatchAndShopService,
    WatchAndShopRepository,
    WatchAndShopCacheSyncService,
    ExpertTalkService,
    ExpertTalkRepository,
    ExpertTalkCacheSyncService,
    TestimonialService,
    CmsPagesService,
    TestimonialRepository,
    CmsPagesRepository,
    TestimonialCacheSyncService,
    ProductsRepository,
    ImportersService,
    ImportersRepository,
    PackersService,
    PackersRepository,
    ProductNaturesService,
    ProductNaturesRepository,
    SubscriptionFrequenciesService,
    SubscriptionFrequenciesRepository,
    WellnessGoalsService,
    WellnessGoalsRepository,
    ReasonMastersService,
    ReasonMastersRepository,
    CategoryFiltersService,
    CategoryFiltersRepository,
    CouponsService,
    CouponsRepository,
    CouponApplicabilityRepository,
    HomeSectionsService,
    HomeSectionsRepository,
    UnitsService,
    UnitsRepository,
    CategoriesCacheSyncService,
    MasterUsageRepository,
    MasterDeletionGuardService,
    // ── Listeners ───────────────────────────────────────────────────────────
    AttributeCacheListener,
    CategoryCacheListener,
    BannerCacheListener,
    WatchAndShopCacheListener,
    ExpertTalkCacheListener,
    TestimonialCacheListener,
    ImporterCacheListener,
    PackerCacheListener,
    SubscriptionFrequencyCacheListener,
    // ── Audit ────────────────────────────────────────────────────────────────
    AuditLogsRepository,
    AuditService,
    // ── Blog ─────────────────────────────────────────────────────────────────
    BlogCategoriesRepository,
    BlogPostsRepository,
    BlogPostProductsRepository,
    BlogCommentsRepository,
    BlogCategoriesService,
    BlogPostsService,
    BlogCommentsService,
    // ── Support ──────────────────────────────────────────────────────────────
    SupportCategoriesRepository,
    SupportArticlesRepository,
    SupportFaqsRepository,
    SupportTicketsRepository,
    TicketMessagesRepository,
    SupportNotificationsRepository,
    SupportCategoriesService,
    SupportArticlesService,
    SupportFaqsService,
    SupportTicketsService,
    SupportTicketNumberService,
    OrderSupportReasonsService,
  ],
  exports: [
    // ── Master ──────────────────────────────────────────────────────────────
    AttributesService,
    BrandsService,
    CategoriesService,
    CategoriesRepository,
    CountriesRepository,
    StatesService,
    CitiesService,
    HealthConcernsService,
    AgeGroupsService,
    ManufacturersService,
    BannersService,
    WatchAndShopService,
    ExpertTalkService,
    TestimonialService,
    CmsPagesService,
    ImportersService,
    PackersService,
    ProductNaturesService,
    ProductNaturesRepository,
    SubscriptionFrequenciesService,
    SubscriptionFrequenciesRepository,
    WellnessGoalsService,
    WellnessGoalsRepository,
    ReasonMastersService,
    ReasonMastersRepository,
    CategoryFiltersService,
    CategoryFiltersRepository,
    CouponsService,
    CouponsRepository,
    HomeSectionsService,
    UnitsService,
    UnitsRepository,
    AttributesRepository,
    CategoriesRepository,
    BrandsRepository,
    HealthConcernsRepository,
    ManufacturersRepository,
    PackersRepository,
    ImportersRepository,
    // ── Audit ────────────────────────────────────────────────────────────────
    AuditService,
    // ── Blog ─────────────────────────────────────────────────────────────────
    BlogCategoriesService,
    BlogPostsService,
    BlogCommentsService,
    // ── Support ──────────────────────────────────────────────────────────────
    SupportCategoriesService,
    SupportArticlesService,
    SupportFaqsService,
    SupportTicketsService,
  ],
})
export class MasterModule {}
