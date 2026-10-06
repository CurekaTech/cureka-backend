import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { GoogleMerchantFeedController } from './controllers/google-merchant-feed.controller';
import { GoogleMerchantFeedService } from './services/google-merchant-feed.service';
import { GoogleMerchantIdLookupService } from './services/google-merchant-id-lookup.service';

@Module({
  imports: [
    ConfigModule,
    UploadsModule,
    TypeOrmModule.forFeature([ProductVariantEntity, CategoryEntity, ProductMediaEntity]),
  ],
  controllers: [GoogleMerchantFeedController],
  providers: [GoogleMerchantFeedService, GoogleMerchantIdLookupService],
  exports: [GoogleMerchantFeedService, GoogleMerchantIdLookupService],
})
export class GoogleMerchantModule {}
