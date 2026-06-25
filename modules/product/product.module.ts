import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
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
import { ProductsRepository } from './repositories/products.repository';
import { ProductVariantsRepository } from './repositories/product-variants.repository';
import { ProductRelationsRepository } from './repositories/product-relations.repository';
import { ProductsService } from './services/products.service';
import { ProductMultipartService } from './services/product-multipart.service';
import { ProductMasterResolverService } from './services/product-master-resolver.service';
import { ProductVariantsService } from './services/product-variants.service';
import { ProductFaqsService } from './services/product-faqs.service';
import {
  SimpleProductStrategy,
  VariableProductStrategy,
  BundleProductStrategy,
  ProductStrategyFactory,
} from './strategies/product-strategies';
import { ProductsController } from './controllers/products.controller';
import { ProductVariantsController } from './controllers/product-variants.controller';
import { ProductFaqsController } from './controllers/product-faqs.controller';
import { ProductTagsController } from './controllers/product-tags.controller';
import { ProductInformationLabelsController } from './controllers/product-information-labels.controller';
import { ProductCacheListener } from './listeners/product-cache.listener';
import { ProductTagsRepository } from './repositories/product-tags.repository';
import { ProductTagsService } from './services/product-tags.service';
import { ProductInformationLabelsRepository } from './repositories/product-information-labels.repository';
import { ProductInformationLabelsService } from './services/product-information-labels.service';

@Module({
  imports: [
    MasterModule,
    UploadsModule,
    TypeOrmModule.forFeature([
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
    ]),
  ],
  controllers: [ProductsController, ProductVariantsController, ProductFaqsController, ProductTagsController, ProductInformationLabelsController],
  providers: [
    ProductsRepository,
    ProductVariantsRepository,
    ProductRelationsRepository,
    ProductTagsRepository,
    ProductInformationLabelsRepository,
    ProductsService,
    ProductMultipartService,
    ProductMasterResolverService,
    ProductVariantsService,
    ProductFaqsService,
    ProductTagsService,
    ProductInformationLabelsService,
    SimpleProductStrategy,
    VariableProductStrategy,
    BundleProductStrategy,
    ProductStrategyFactory,
    ProductCacheListener,
  ],
  exports: [ProductsService, ProductsRepository, ProductMasterResolverService],
})
export class ProductModule {}
