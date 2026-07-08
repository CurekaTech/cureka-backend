import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ShipmentEntity } from './entities/shipment.entity';
import { ShipmentEventEntity } from './entities/shipment-event.entity';
import { ShipmentsRepository } from './repositories/shipments.repository';
import { ShipmentEventsRepository } from './repositories/shipment-events.repository';
import { ShipmentsController } from './controllers/shipments.controller';
import { ShipwayService } from './services/shipway.service';
import { ShippingQueueService } from './services/shipping-queue.service';
import { ShippingService } from './services/shipping.service';
import { ShipmentsService } from './services/shipments.service';
import { ShipwayWebhookController } from './controllers/shipway-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      ShipmentEntity,
      ShipmentEventEntity,
    ]),
    QueueModule.registerQueue(QUEUE_NAMES.SHIPPING),
  ],
  controllers: [ShipmentsController, ShipwayWebhookController],
  providers: [
    OrdersRepository,
    ShipmentsRepository,
    ShipmentEventsRepository,
    ShipwayService,
    ShippingQueueService,
    ShippingService,
    ShipmentsService,
  ],
  exports: [ShippingQueueService, ShippingService, ShipmentsService, ShipmentsRepository],
})
export class ShippingModule {}
