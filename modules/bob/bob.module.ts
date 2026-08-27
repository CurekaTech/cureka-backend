import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MasterModule } from '@modules/master/master.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { ProductModule } from '@modules/product/product.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { BobBrandController } from './controllers/bob-brand.controller';
import { BobCommerceController } from './controllers/bob-commerce.controller';
import { BobWebhooksController } from './controllers/bob-webhooks.controller';
import { BobApiKeyGuard } from './guards/bob-api-key.guard';
import { BobWebhookSecretGuard } from './guards/bob-webhook-secret.guard';
import { BobRequestLogInterceptor } from './interceptors/bob-request-log.interceptor';
import { BobNotifyListener } from './listeners/bob-notify.listener';
import { BobAbandonedCartWebhookService } from './services/bob-abandoned-cart-webhook.service';
import { BobBrandService } from './services/bob-brand.service';
import { BobCatalogService } from './services/bob-catalog.service';
import { BobNotifyService } from './services/bob-notify.service';
import { BobOrdersService } from './services/bob-orders.service';

@Module({
  imports: [
    OrdersModule,
    UsersModule,
    ProductModule,
    ShippingModule,
    MasterModule,
    UploadsModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('bob.timeoutMs') ?? 15000,
        maxRedirects: 3,
      }),
    }),
  ],
  controllers: [BobCommerceController, BobBrandController, BobWebhooksController],
  providers: [
    BobApiKeyGuard,
    BobWebhookSecretGuard,
    BobRequestLogInterceptor,
    BobCatalogService,
    BobOrdersService,
    BobBrandService,
    BobNotifyService,
    BobNotifyListener,
    BobAbandonedCartWebhookService,
  ],
  exports: [BobNotifyService],
})
export class BobModule {}
