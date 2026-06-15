import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterModule } from '@modules/master/master.module';
import { ProductEntity } from './entities/product.entity';
import { ProductVariantEntity } from './entities/product-variant.entity';
import { VariantAttributeValueEntity } from './entities/variant-attribute-value.entity';
import { ProductMediaEntity } from './entities/product-media.entity';
import { ProductHealthConcernEntity } from './entities/product-health-concern.entity';
import { ProductTagEntity } from './entities/product-tag.entity';
import { ProductTagMappingEntity } from './entities/product-tag-mapping.entity';
import { ProductBundleEntity } from './entities/product-bundle.entity';
import { ProductFaqEntity } from './entities/product-faq.entity';
import { ProductFaqMappingEntity } from './entities/product-faq-mapping.entity';
import { ProductsRepository } from './repositories/products.repository';
import { ProductVariantsRepository } from './repositories/product-variants.repository';
import { ProductRelationsRepository } from './repositories/product-relations.repository';
import { ProductsService } from './services/products.service';
import { ProductWizardService } from './services/product-wizard.service';
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
import { ProductWizardController } from './controllers/product-wizard.controller';
import { ProductVariantsController } from './controllers/product-variants.controller';
import { ProductFaqsController } from './controllers/product-faqs.controller';
import { ProductCacheListener } from './listeners/product-cache.listener';

@Module({
  imports: [
    MasterModule,
    TypeOrmModule.forFeature([
      ProductEntity,
      ProductVariantEntity,
      VariantAttributeValueEntity,
      ProductMediaEntity,
      ProductHealthConcernEntity,
      ProductTagEntity,
      ProductTagMappingEntity,
      ProductBundleEntity,
      ProductFaqEntity,
      ProductFaqMappingEntity,
    ]),
  ],
  controllers: [
    ProductWizardController,
    ProductsController,
    ProductVariantsController,
    ProductFaqsController,
  ],
  providers: [
    ProductsRepository,
    ProductVariantsRepository,
    ProductRelationsRepository,
    ProductsService,
    ProductWizardService,
    ProductMasterResolverService,
    ProductVariantsService,
    ProductFaqsService,
    SimpleProductStrategy,
    VariableProductStrategy,
    BundleProductStrategy,
    ProductStrategyFactory,
    ProductCacheListener,
  ],
  exports: [ProductsService],
})
export class ProductModule {}
