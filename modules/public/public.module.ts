import { Module } from '@nestjs/common';
import { MasterModule } from '@modules/master/master.module';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { HomepageController } from './controllers/homepage.controller';
import { PublicProductsController } from './controllers/public-products.controller';
import { HomepageService } from './services/homepage.service';
import { HomepageSectionsService } from './services/homepage-sections.service';
import { PublicProductsService } from './services/public-products.service';

@Module({
  imports: [MasterModule, ProductModule, UploadsModule],
  controllers: [HomepageController, PublicProductsController],
  providers: [HomepageService, HomepageSectionsService, PublicProductsService],
})
export class PublicModule {}
