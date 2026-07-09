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

/**
 * Outbound UniCommerce "Post Orders" integration (Cureka -> UniCommerce).
 * Shared by the API app (enqueue) and the worker app (process).
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
  ],
  exports: [UnicommerceOrderService, UnicommerceOrderQueueService],
})
export class UnicommerceOrderModule {}
