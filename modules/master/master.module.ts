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
import { ImporterEntity } from './entities/importer.entity';
import { PackerEntity } from './entities/packer.entity';
import { ProductNatureEntity } from './entities/product-nature.entity';
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
import { ImportersRepository } from './repositories/importers.repository';
import { PackersRepository } from './repositories/packers.repository';
import { ProductNaturesRepository } from './repositories/product-natures.repository';
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
import { ImportersService } from './services/importers.service';
import { PackersService } from './services/packers.service';
import { ProductNaturesService } from './services/product-natures.service';
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
import { ImportersController } from './controllers/importers.controller';
import { PackersController } from './controllers/packers.controller';
import { ProductNaturesController } from './controllers/product-natures.controller';
import { AttributeCacheListener } from './listeners/attribute-cache.listener';
import { CategoryCacheListener } from './listeners/category-cache.listener';
import { BannerCacheListener } from './listeners/banner-cache.listener';
import { ImporterCacheListener } from './listeners/importer-cache.listener';
import { PackerCacheListener } from './listeners/packer-cache.listener';
import { CategoriesCacheSyncService } from './services/categories-cache-sync.service';

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
      ImporterEntity,
      PackerEntity,
      ProductNatureEntity,
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
    ImportersController,
    PackersController,
    ProductNaturesController,
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
    ImportersService,
    ImportersRepository,
    PackersService,
    PackersRepository,
    ProductNaturesService,
    ProductNaturesRepository,
    CategoriesCacheSyncService,
    AttributeCacheListener,
    CategoryCacheListener,
    BannerCacheListener,
    ImporterCacheListener,
    PackerCacheListener,
  ],
  exports: [
    AttributesService,
    BrandsService,
    CategoriesService,
    CategoriesRepository,
    CountriesService,
    StatesService,
    CitiesService,
    HealthConcernsService,
    AgeGroupsService,
    ManufacturersService,
    BannersService,
    ImportersService,
    PackersService,
    ProductNaturesService,
  ],
})
export class MasterModule {}
