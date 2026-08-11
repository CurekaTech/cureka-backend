import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { UsersModule } from '@modules/users/users.module';
import { MasterModule } from '@modules/master/master.module';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { GokwikCartController } from './controllers/gokwik-cart.controller';
import { GokwikOrderController } from './controllers/gokwik-order.controller';
import { GokwikWebhookController } from './controllers/gokwik-webhook.controller';
import { GokwikAdminController } from './controllers/gokwik-admin.controller';
import { GokwikAbandonedCartEntity } from './entities/gokwik-abandoned-cart.entity';
import { GokwikOrderEntity } from './entities/gokwik-order.entity';
import { GokwikRefundEntity } from './entities/gokwik-refund.entity';
import { GokwikSyncStateEntity } from './entities/gokwik-sync-state.entity';
import { GokwikWebhookEventEntity } from './entities/gokwik-webhook-event.entity';
import { GokwikCallbackGuard } from './guards/gokwik-callback.guard';
import { GokwikCartOwnerGuard } from './guards/gokwik-cart-owner.guard';
import { GokwikWebhookGuard } from './guards/gokwik-webhook.guard';
import { GokwikCancelListener } from './listeners/gokwik-cancel.listener';
import { GokwikCatalogListener } from './listeners/gokwik-catalog.listener';
import { GokwikFulfillmentListener } from './listeners/gokwik-fulfillment.listener';
import { GokwikProcessor } from './processors/gokwik.processor';
import { GokwikRepository } from './repositories/gokwik.repository';
import { GokwikApiService } from './services/gokwik-api.service';
import { GokwikCancelService } from './services/gokwik-cancel.service';
import { GokwikCartService } from './services/gokwik-cart.service';
import { GokwikOrderService } from './services/gokwik-order.service';
import { GokwikQueueService } from './services/gokwik-queue.service';
import { GokwikWebhookService } from './services/gokwik-webhook.service';
import { GokwikCatalogSyncService } from './services/gokwik-catalog-sync.service';
import { GokwikFulfillmentService } from './services/gokwik-fulfillment.service';

@Module({
  imports: [
    AdminSettingsModule,
    OrdersModule,
    UsersModule,
    MasterModule,
    UploadsModule,
    TypeOrmModule.forFeature([
      GokwikOrderEntity,
      GokwikWebhookEventEntity,
      GokwikRefundEntity,
      GokwikAbandonedCartEntity,
      GokwikSyncStateEntity,
    ]),
    QueueModule.registerQueue(QUEUE_NAMES.GOKWIK),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('gokwik.timeoutMs') ?? 15000,
        maxRedirects: 3,
      }),
    }),
  ],
  controllers: [
    GokwikCartController,
    GokwikOrderController,
    GokwikWebhookController,
    GokwikAdminController,
  ],
  providers: [
    GokwikCartService,
    GokwikOrderService,
    GokwikApiService,
    GokwikCallbackGuard,
    GokwikCartOwnerGuard,
    GokwikWebhookGuard,
    GokwikRepository,
    GokwikQueueService,
    GokwikWebhookService,
    GokwikCatalogSyncService,
    GokwikCatalogListener,
    GokwikFulfillmentService,
    GokwikFulfillmentListener,
    GokwikCancelService,
    GokwikCancelListener,
    GokwikProcessor,
  ],
  exports: [GokwikApiService, GokwikRepository, GokwikQueueService, GokwikWebhookService],
})
export class GokwikModule {}
