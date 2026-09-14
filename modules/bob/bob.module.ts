import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MasterModule } from '@modules/master/master.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { ProductModule } from '@modules/product/product.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { UsersModule } from '@modules/users/users.module';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { BobBrandController } from './controllers/bob-brand.controller';
import { BobCommerceController } from './controllers/bob-commerce.controller';
import { BobWebhooksController } from './controllers/bob-webhooks.controller';
import { BobApiKeyGuard } from './guards/bob-api-key.guard';
import { BobWebhookSecretGuard } from './guards/bob-webhook-secret.guard';
import { BobRequestLogInterceptor } from './interceptors/bob-request-log.interceptor';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BobNotifyOutboxEntity } from './entities/bob-notify-outbox.entity';
import { BobAbandonedCartOutboxEntity } from './entities/bob-abandoned-cart-outbox.entity';
import { BobNotifyListener } from './listeners/bob-notify.listener';
import { BobAbandonedCartProcessor } from './processors/bob-abandoned-cart.processor';
import { BobAbandonedCartOutboxRepository } from './repositories/bob-abandoned-cart-outbox.repository';
import { BobNotifyOutboxRepository } from './repositories/bob-notify-outbox.repository';
import { BobAbandonedCartNotifyService } from './services/bob-abandoned-cart-notify.service';
import { BobAbandonedCartQueueService } from './services/bob-abandoned-cart-queue.service';
import { BobAbandonedCartWebhookService } from './services/bob-abandoned-cart-webhook.service';
import { BobBrandService } from './services/bob-brand.service';
import { BobCatalogService } from './services/bob-catalog.service';
import { BobNotifyService } from './services/bob-notify.service';
import { BobFulfillmentNotifyOutboxService } from './services/bob-fulfillment-notify-outbox.service';
import { BobOrdersService } from './services/bob-orders.service';

@Module({
  imports: [
    OrdersModule,
    UsersModule,
    ProductModule,
    ShippingModule,
    MasterModule,
    UploadsModule,
    QueueModule.registerQueue(QUEUE_NAMES.BOB_ABANDONED_CART),
    TypeOrmModule.forFeature([BobNotifyOutboxEntity, BobAbandonedCartOutboxEntity]),
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
    BobNotifyOutboxRepository,
    BobAbandonedCartOutboxRepository,
    BobFulfillmentNotifyOutboxService,
    BobAbandonedCartNotifyService,
    BobAbandonedCartQueueService,
    BobAbandonedCartProcessor,
    BobNotifyListener,
    BobAbandonedCartWebhookService,
  ],
  exports: [BobNotifyService, BobFulfillmentNotifyOutboxService, BobAbandonedCartNotifyService],
})
export class BobModule {}
