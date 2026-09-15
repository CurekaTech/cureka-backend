import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { UnicommerceOrderApiService } from './services/unicommerce-order-api.service';
import { UnicommerceOrderService } from './services/unicommerce-order.service';
import { UnicommerceOrderQueueService } from './services/unicommerce-order-queue.service';
import { UnicommerceOrderProcessor } from './processors/unicommerce-order.processor';
import { UnicommerceOrderCancelListener } from './listeners/unicommerce-order-cancel.listener';

/**
 * Outbound UniCommerce "Post Orders" integration (Cureka -> UniCommerce).
 * Enqueues and processes push jobs in the API app.
 * Also listens for ORDER_CANCELLED to call Uniware saleOrder/cancel.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, OrderItemEntity]),
    QueueModule.registerQueue(QUEUE_NAMES.UNICOMMERCE),
  ],
  providers: [
    OrdersRepository,
    UnicommerceOrderApiService,
    UnicommerceOrderService,
    UnicommerceOrderQueueService,
    UnicommerceOrderProcessor,
    UnicommerceOrderCancelListener,
  ],
  exports: [UnicommerceOrderService, UnicommerceOrderQueueService, UnicommerceOrderApiService],
})
export class UnicommerceOrderModule {}
