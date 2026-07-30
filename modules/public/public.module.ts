import { Module } from '@nestjs/common';
import { MasterModule } from '@modules/master/master.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { HomepageController } from './controllers/homepage.controller';
import { PublicCommonController } from './controllers/public-common.controller';
import { PublicExpertTalkController } from './controllers/public-expert-talk.controller';
import { PublicWatchAndShopController } from './controllers/public-watch-and-shop.controller';
import { PublicProductsController } from './controllers/public-products.controller';
import { PublicBundlesController } from './controllers/public-bundles.controller';
import { HomepageService } from './services/homepage.service';
import { HomepageSectionsService } from './services/homepage-sections.service';
import { PublicCommonService } from './services/public-common.service';
import { PublicWatchAndShopService } from './services/public-watch-and-shop.service';
import { PublicProductsService } from './services/public-products.service';
import { PublicBundlesService } from './services/public-bundles.service';

@Module({
  imports: [MasterModule, ProductModule, UploadsModule],
  controllers: [
    HomepageController,
    PublicCommonController,
    PublicExpertTalkController,
    PublicWatchAndShopController,
    PublicProductsController,
    PublicBundlesController,
  ],
  providers: [
    HomepageService,
    HomepageSectionsService,
    PublicCommonService,
    PublicWatchAndShopService,
    PublicProductsService,
    PublicBundlesService,
  ],
})
export class PublicModule {}
