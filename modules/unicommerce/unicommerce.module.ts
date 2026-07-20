import { Module } from '@nestjs/common';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { UnicommerceAuthController } from './controllers/unicommerce-auth.controller';
import { UnicommerceCatalogController } from './controllers/unicommerce-catalog.controller';
import { UnicommerceInventoryController } from './controllers/unicommerce-inventory.controller';
import { UnicommerceAuthService } from './services/unicommerce-auth.service';
import { UnicommerceCatalogService } from './services/unicommerce-catalog.service';
import { UnicommerceInventoryService } from './services/unicommerce-inventory.service';
import { UnicommerceApiKeyGuard } from './guards/unicommerce-api-key.guard';
import { UnicommerceProductApiService } from './services/unicommerce-product-api.service';
import { UnicommerceProductSyncService } from './services/unicommerce-product-sync.service';
import { UnicommerceProductQueueService } from './services/unicommerce-product-queue.service';
import { UnicommerceProductProcessor } from './processors/unicommerce-product.processor';
import { UnicommerceProductListener } from './listeners/unicommerce-product.listener';

@Module({
  imports: [
    ProductModule,
    UploadsModule,
    QueueModule.registerQueue(QUEUE_NAMES.UNICOMMERCE_PRODUCTS),
  ],
  controllers: [
    UnicommerceAuthController,
    UnicommerceCatalogController,
    UnicommerceInventoryController,
  ],
  providers: [
    UnicommerceAuthService,
    UnicommerceCatalogService,
    UnicommerceInventoryService,
    UnicommerceApiKeyGuard,
    UnicommerceProductApiService,
    UnicommerceProductSyncService,
    UnicommerceProductQueueService,
    UnicommerceProductProcessor,
    UnicommerceProductListener,
  ],
})
export class UnicommerceModule {}
