import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';
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
import { AttributeCacheListener } from './listeners/attribute-cache.listener';
import { CategoryCacheListener } from './listeners/category-cache.listener';
import { BannerCacheListener } from './listeners/banner-cache.listener';
import { WatchAndShopCacheListener } from './listeners/watch-and-shop-cache.listener';
import { ExpertTalkCacheListener } from './listeners/expert-talk-cache.listener';
import { TestimonialCacheListener } from './listeners/testimonial-cache.listener';
import { ImporterCacheListener } from './listeners/importer-cache.listener';
import { PackerCacheListener } from './listeners/packer-cache.listener';
import { SubscriptionFrequencyCacheListener } from './listeners/subscription-frequency-cache.listener';
import { CategoriesCacheSyncService } from './services/categories-cache-sync.service';
import { MasterUsageRepository } from './repositories/master-usage.repository';
import { MasterDeletionGuardService } from './services/master-deletion-guard.service';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductHealthConcernEntity } from '@modules/product/entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '@modules/product/entities/product-wellness-goal.entity';
import { ProductAttributeMappingEntity } from '@modules/product/entities/product-attribute-mapping.entity';
import { VariantAttributeValueEntity } from '@modules/product/entities/variant-attribute-value.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
      ProductEntity,
      ProductHealthConcernEntity,
      ProductWellnessGoalEntity,
      ProductAttributeMappingEntity,
      VariantAttributeValueEntity,
    ]),
    UploadsModule,
  ],
  controllers: [
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
  ],
  providers: [
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
    TestimonialRepository,
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
    AttributeCacheListener,
    CategoryCacheListener,
    BannerCacheListener,
    WatchAndShopCacheListener,
    ExpertTalkCacheListener,
    TestimonialCacheListener,
    ImporterCacheListener,
    PackerCacheListener,
    SubscriptionFrequencyCacheListener,
  ],
  exports: [
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
  ],
})
export class MasterModule {}
