import { Module } from '@nestjs/common';
import { MasterModule } from '@modules/master/master.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { BlogModule } from '@modules/blog/blog.module';
import { HomepageController } from './controllers/homepage.controller';
import { PublicCommonController } from './controllers/public-common.controller';
import { PublicProductsController } from './controllers/public-products.controller';
import { HomepageService } from './services/homepage.service';
import { HomepageSectionsService } from './services/homepage-sections.service';
import { PublicCommonService } from './services/public-common.service';
import { PublicProductsService } from './services/public-products.service';

@Module({
  imports: [MasterModule, ProductModule, UploadsModule, BlogModule],
  controllers: [HomepageController, PublicCommonController, PublicProductsController],
  providers: [HomepageService, HomepageSectionsService, PublicCommonService, PublicProductsService],
})
export class PublicModule {}
