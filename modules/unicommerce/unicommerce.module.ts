import { Module } from '@nestjs/common';
import { ProductModule } from '@modules/product/product.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UnicommerceAuthController } from './controllers/unicommerce-auth.controller';
import { UnicommerceCatalogController } from './controllers/unicommerce-catalog.controller';
import { UnicommerceInventoryController } from './controllers/unicommerce-inventory.controller';
import { UnicommerceAuthService } from './services/unicommerce-auth.service';
import { UnicommerceCatalogService } from './services/unicommerce-catalog.service';
import { UnicommerceInventoryService } from './services/unicommerce-inventory.service';
import { UnicommerceApiKeyGuard } from './guards/unicommerce-api-key.guard';

@Module({
  imports: [ProductModule, UploadsModule],
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
  ],
})
export class UnicommerceModule {}
