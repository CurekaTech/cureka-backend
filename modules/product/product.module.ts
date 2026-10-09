import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { UsersModule } from '@modules/users/users.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { SitemapModule } from '@modules/sitemap/sitemap.module';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { GalleryModule } from '../gallery/gallery.module';
import { OosEmailModule } from '@modules/oos-email/oos-email.module';
import { PincodesModule } from '@modules/pincodes/pincodes.module';

// ── Product entities ─────────────────────────────────────────────────────────
import { ProductEntity } from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import { VariantAttributeValueEntity } from './entities/variant-attribute-value.entity';
import { ProductMediaEntity } from './entities/product-media.entity';
import { ProductHealthConcernEntity } from './entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from './entities/product-wellness-goal.entity';
import { ProductTagEntity } from './entities/product-tag.entity';
import { ProductTagMappingEntity } from './entities/product-tag-mapping.entity';
import { ProductInformationLabelEntity } from './entities/product-information-label.entity';
import { ProductBundleEntity } from './entities/product-bundle.entity';
import { ProductFaqEntity } from './entities/product-faq.entity';
import { ProductFaqMappingEntity } from './entities/product-faq-mapping.entity';
import { ProductAttributeMappingEntity } from './entities/product-attribute-mapping.entity';
import { ProductCategoryFilterMappingEntity } from './entities/product-category-filter-mapping.entity';
import { ProductCategoryHierarchyEntity } from './entities/product-category-hierarchy.entity';
import { BulkUploadEntity } from './entities/bulk-upload.entity';

// ── Wishlist entity ──────────────────────────────────────────────────────────
import { WishlistItemEntity } from './entities/wishlist-item.entity';

// ── Reviews entities ─────────────────────────────────────────────────────────
import { ProductReviewEntity } from './entities/product-review.entity';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';

// ── Product repositories ─────────────────────────────────────────────────────
import { ProductsRepository } from './repositories/products.repository';
import { ProductVariantsRepository } from './repositories/product-variants.repository';
import { ProductRelationsRepository } from './repositories/product-relations.repository';
import { ProductTagsRepository } from './repositories/product-tags.repository';
import { ProductInformationLabelsRepository } from './repositories/product-information-labels.repository';
import { BulkUploadsRepository } from './repositories/bulk-uploads.repository';

// ── Wishlist repository ──────────────────────────────────────────────────────
import { WishlistItemsRepository } from './repositories/wishlist-items.repository';

// ── Reviews repository ───────────────────────────────────────────────────────
import { ProductReviewsRepository } from './repositories/product-reviews.repository';

// ── Product services ─────────────────────────────────────────────────────────
import { ProductsService } from './services/products.service';
import { BundleAvailabilityService } from './services/bundle-availability.service';
import { CombineSimpleProductsService } from './services/combine-simple-products.service';
import { BestSellersIndexingService } from './services/best-sellers-indexing.service';
import { CategoryProductIndexingService } from './services/category-product-indexing.service';
import { ProductMultipartService } from './services/product-multipart.service';
import { ProductMasterResolverService } from './services/product-master-resolver.service';
import { ProductVariantsService } from './services/product-variants.service';
import { ProductFaqsService } from './services/product-faqs.service';
import { ProductTagsService } from './services/product-tags.service';
import { ProductInformationLabelsService } from './services/product-information-labels.service';
import { ProductWizardBootstrapService } from './services/product-wizard-bootstrap.service';
import { BulkUploadService } from './services/bulk-upload.service';
import { BulkUploadExportStreamService } from './services/bulk-upload-export-stream.service';
import { BulkUploadImageComparisonExportService } from './services/bulk-upload-image-comparison-export.service';
import { BulkUploadParserService } from './services/bulk-upload-parser.service';
import { BulkUploadValidatorService } from './services/bulk-upload-validator.service';

// ── Wishlist service ─────────────────────────────────────────────────────────
import { WishlistService } from './services/wishlist.service';

// ── Reviews service ──────────────────────────────────────────────────────────
import { ProductReviewsService } from './services/product-reviews.service';

// ── Product strategies ───────────────────────────────────────────────────────
import {
  SimpleProductStrategy,
  VariableProductStrategy,
  BundleProductStrategy,
  ProductStrategyFactory,
} from './strategies/product-strategies';

// ── Product controllers ──────────────────────────────────────────────────────
import { ProductsController } from './controllers/products.controller';
import { BundleProductsController } from './controllers/bundle-products.controller';
import { BestSellersIndexingController } from './controllers/best-sellers-indexing.controller';
import { CategoryProductIndexingController } from './controllers/category-product-indexing.controller';
import { ProductVariantsController } from './controllers/product-variants.controller';
import { ProductFaqsController } from './controllers/product-faqs.controller';
import { ProductTagsController } from './controllers/product-tags.controller';
import { ProductInformationLabelsController } from './controllers/product-information-labels.controller';
import { ProductWizardController } from './controllers/product-wizard.controller';
import { BulkUploadController } from './controllers/bulk-upload.controller';
import { BulkPriceUpdateController } from './controllers/bulk-price-update.controller';
import { BulkCodUpdateController } from './controllers/bulk-cod-update.controller';
import { BulkReturnUpdateController } from './controllers/bulk-return-update.controller';

// ── Wishlist controller (route unchanged: wishlist/*) ────────────────────────
import { WishlistController } from './controllers/wishlist.controller';

// ── Reviews controllers (routes unchanged: reviews/*, public/products/*) ─────
import { AdminProductReviewsController } from './controllers/admin-product-reviews.controller';
import { PublicProductReviewsController } from './controllers/public-product-reviews.controller';

// ── Listeners ────────────────────────────────────────────────────────────────
import { ProductCacheListener } from './listeners/product-cache.listener';
import { BundleAvailabilityListener } from './listeners/bundle-availability.listener';

// ── Processors ───────────────────────────────────────────────────────────────
import { BulkUploadProcessor } from './processors/bulk-upload.processor';
import { BulkPriceUpdateProcessor } from './processors/bulk-price-update.processor';
import { BulkPriceUpdateService } from './services/bulk-price-update.service';
import { BulkPriceUpdateParserService } from './services/bulk-price-update-parser.service';
import { BulkCodUpdateProcessor } from './processors/bulk-cod-update.processor';
import { BulkReturnUpdateProcessor } from './processors/bulk-return-update.processor';
import { BulkCodUpdateService } from './services/bulk-cod-update.service';
import { BulkReturnUpdateService } from './services/bulk-return-update.service';
import { BulkCodUpdateParserService } from './services/bulk-cod-update-parser.service';
import { BulkReturnUpdateParserService } from './services/bulk-return-update-parser.service';

const BULK_UPLOAD_PROCESSOR_ENABLED =
  (process.env.BULK_UPLOAD_PROCESSOR_ENABLED ?? 'true').toLowerCase() === 'true';

const BULK_PRICE_UPDATE_PROCESSOR_ENABLED =
  (process.env.BULK_PRICE_UPDATE_PROCESSOR_ENABLED ?? 'true').toLowerCase() === 'true';

const BULK_COD_UPDATE_PROCESSOR_ENABLED =
  (process.env.BULK_COD_UPDATE_PROCESSOR_ENABLED ?? 'true').toLowerCase() === 'true';

const BULK_RETURN_UPDATE_PROCESSOR_ENABLED =
  (process.env.BULK_RETURN_UPDATE_PROCESSOR_ENABLED ?? 'true').toLowerCase() === 'true';

@Module({
  imports: [
    MasterModule,
    UploadsModule,
    GalleryModule,
    // OrdersModule and UsersModule are needed by ProductReviewsService
    forwardRef(() => OrdersModule),
    UsersModule,
    forwardRef(() => SubscriptionModule),
    forwardRef(() => SitemapModule),
    OosEmailModule,
    PincodesModule,
    QueueModule.registerQueue('bulk-upload'),
    QueueModule.registerQueue('bulk-price-update'),
    QueueModule.registerQueue('bulk-cod-update'),
    QueueModule.registerQueue('bulk-return-update'),
    QueueModule.registerQueue(QUEUE_NAMES.UNICOMMERCE_PRODUCTS),
    TypeOrmModule.forFeature([
      // ── Product ──────────────────────────────────────────────────────────
      ProductEntity,
      ProductVariantEntity,
      VariantAttributeValueEntity,
      ProductMediaEntity,
      ProductHealthConcernEntity,
      ProductWellnessGoalEntity,
      ProductTagEntity,
      ProductTagMappingEntity,
      ProductInformationLabelEntity,
      ProductBundleEntity,
      ProductFaqEntity,
      ProductFaqMappingEntity,
      ProductAttributeMappingEntity,
      ProductCategoryFilterMappingEntity,
      ProductCategoryHierarchyEntity,
      BulkUploadEntity,
      // ── Wishlist ─────────────────────────────────────────────────────────
      WishlistItemEntity,
      // ── Reviews ──────────────────────────────────────────────────────────
      ProductReviewEntity,
      AdminUserEntity,
    ]),
  ],
  controllers: [
    BulkUploadController,
    BulkPriceUpdateController,
    BulkCodUpdateController,
    BulkReturnUpdateController,
    ProductsController,
    BundleProductsController,
    BestSellersIndexingController,
    CategoryProductIndexingController,
    ProductVariantsController,
    ProductFaqsController,
    ProductTagsController,
    ProductInformationLabelsController,
    ProductWizardController,
    // ── Wishlist (route unchanged: wishlist/*) ────────────────────────────
    WishlistController,
    // ── Reviews (routes unchanged: reviews/*, public/products/*/reviews) ──
    AdminProductReviewsController,
    PublicProductReviewsController,
  ],
  providers: [
    // ── Product ────────────────────────────────────────────────────────────
    ProductsRepository,
    ProductVariantsRepository,
    ProductRelationsRepository,
    ProductTagsRepository,
    ProductInformationLabelsRepository,
    ProductsService,
    BundleAvailabilityService,
    CombineSimpleProductsService,
    BestSellersIndexingService,
    CategoryProductIndexingService,
    ProductMultipartService,
    ProductMasterResolverService,
    ProductVariantsService,
    ProductFaqsService,
    ProductTagsService,
    ProductInformationLabelsService,
    ProductWizardBootstrapService,
    SimpleProductStrategy,
    VariableProductStrategy,
    BundleProductStrategy,
    ProductStrategyFactory,
    ProductCacheListener,
    BundleAvailabilityListener,
    BulkUploadsRepository,
    BulkUploadService,
    BulkUploadExportStreamService,
    BulkUploadImageComparisonExportService,
    ...(BULK_UPLOAD_PROCESSOR_ENABLED ? [BulkUploadProcessor] : []),
    BulkUploadParserService,
    BulkUploadValidatorService,
    BulkPriceUpdateService,
    BulkPriceUpdateParserService,
    ...(BULK_PRICE_UPDATE_PROCESSOR_ENABLED ? [BulkPriceUpdateProcessor] : []),
    BulkCodUpdateService,
    BulkReturnUpdateService,
    BulkCodUpdateParserService,
    BulkReturnUpdateParserService,
    ...(BULK_COD_UPDATE_PROCESSOR_ENABLED ? [BulkCodUpdateProcessor] : []),
    ...(BULK_RETURN_UPDATE_PROCESSOR_ENABLED ? [BulkReturnUpdateProcessor] : []),
    // ── Wishlist ────────────────────────────────────────────────────────────
    WishlistItemsRepository,
    WishlistService,
    // ── Reviews ─────────────────────────────────────────────────────────────
    ProductReviewsRepository,
    ProductReviewsService,
  ],
  exports: [
    ProductsService,
    ProductsRepository,
    ProductVariantsRepository,
    ProductMasterResolverService,
    ProductInformationLabelsRepository,
    BulkUploadsRepository,
    BulkUploadService,
    ...(BULK_UPLOAD_PROCESSOR_ENABLED ? [BulkUploadProcessor] : []),
    BulkUploadParserService,
    BulkUploadValidatorService,
    BulkPriceUpdateService,
    // ── Wishlist ─────────────────────────────────────────────────────────────
    WishlistService,
    // ── Reviews ──────────────────────────────────────────────────────────────
    ProductReviewsService,
    ProductReviewsRepository,
    PincodesModule,
  ],
})
export class ProductModule {}
