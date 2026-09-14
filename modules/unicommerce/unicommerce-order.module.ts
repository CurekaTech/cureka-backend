import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderFulfillmentEventEntity } from '@modules/orders/entities/order-fulfillment-event.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderFulfillmentEventsRepository } from '@modules/orders/repositories/order-fulfillment-events.repository';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { RefundRequestsModule } from '@modules/refund-requests/refund-requests.module';
import { ShippingModule } from '@modules/shipping/shipping.module';
import { UnicommerceOrderApiService } from './services/unicommerce-order-api.service';
import { UnicommerceOrderService } from './services/unicommerce-order.service';
import { UnicommerceOrderQueueService } from './services/unicommerce-order-queue.service';
import { OrderFulfillmentCancelService } from './services/order-fulfillment-cancel.service';
import { UnicommerceOrderProcessor } from './processors/unicommerce-order.processor';

/**
 * Outbound UniCommerce "Post Orders" integration (Cureka -> UniCommerce).
 * Enqueues and processes push jobs in the API app.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderFulfillmentEventEntity,
      CouponUsageEntity,
      ProductVariantEntity,
    ]),
    QueueModule.registerQueue(QUEUE_NAMES.UNICOMMERCE),
    ShippingModule,
    NotificationsModule,
    forwardRef(() => RefundRequestsModule),
  ],
  providers: [
    OrdersRepository,
    OrderFulfillmentEventsRepository,
    UnicommerceOrderApiService,
    UnicommerceOrderService,
    UnicommerceOrderQueueService,
    OrderFulfillmentCancelService,
    UnicommerceOrderProcessor,
  ],
  exports: [
    UnicommerceOrderService,
    UnicommerceOrderQueueService,
    UnicommerceOrderApiService,
    OrderFulfillmentCancelService,
    OrderFulfillmentEventsRepository,
  ],
})
export class UnicommerceOrderModule {}
