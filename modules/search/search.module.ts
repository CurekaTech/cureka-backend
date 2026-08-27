import { Module } from '@nestjs/common';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { MasterModule } from '@modules/master/master.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { PublicSearchController } from './controllers/public-search.controller';
import { BrandTypesenseListener } from './listeners/brand-typesense.listener';
import { CategoryTypesenseListener } from './listeners/category-typesense.listener';
import { HealthConcernTypesenseListener } from './listeners/health-concern-typesense.listener';
import { ProductTypesenseListener } from './listeners/product-typesense.listener';
import { PublicSearchService } from './services/public-search.service';
import { TypesenseClientService } from './services/typesense-client.service';
import { TypesenseCollectionService } from './services/typesense-collection.service';
import { TypesenseIndexerService } from './services/typesense-indexer.service';

@Module({
  imports: [ProductModule, MasterModule, UploadsModule, AdminSettingsModule],
  controllers: [PublicSearchController],
  providers: [
    TypesenseClientService,
    TypesenseCollectionService,
    TypesenseIndexerService,
    PublicSearchService,
    ProductTypesenseListener,
    BrandTypesenseListener,
    CategoryTypesenseListener,
    HealthConcernTypesenseListener,
  ],
  exports: [TypesenseIndexerService, PublicSearchService],
})
export class SearchModule {}
