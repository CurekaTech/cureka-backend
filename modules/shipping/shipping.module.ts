import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ShipmentEntity } from './entities/shipment.entity';
import { ShipmentEventEntity } from './entities/shipment-event.entity';
import { ShipmentItemEntity } from './entities/shipment-item.entity';
import { ShipmentsRepository } from './repositories/shipments.repository';
import { ShipmentEventsRepository } from './repositories/shipment-events.repository';
import { ShipmentsController } from './controllers/shipments.controller';
import { ShipwayService } from './services/shipway.service';
import { ShippingService } from './services/shipping.service';
import { ShipmentsService } from './services/shipments.service';
import { ShipwayWebhookController } from './controllers/shipway-webhook.controller';
import { ShipwayShipmentReconciliationService } from './services/shipway-shipment-reconciliation.service';
import { ShipwayWebhookUnresolvedEntity } from './entities/shipway-webhook-unresolved.entity';
import { ShipwayWebhookUnresolvedRepository } from './repositories/shipway-webhook-unresolved.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      ShipmentEntity,
      ShipmentEventEntity,
      ShipmentItemEntity,
      ShipwayWebhookUnresolvedEntity,
    ]),
  ],
  controllers: [ShipwayWebhookController, ShipmentsController],
  providers: [
    OrdersRepository,
    ShipmentsRepository,
    ShipmentEventsRepository,
    ShipwayWebhookUnresolvedRepository,
    ShipwayService,
    ShippingService,
    ShipmentsService,
    ShipwayShipmentReconciliationService,
  ],
  exports: [ShippingService, ShipmentsRepository, ShipwayShipmentReconciliationService],
})
export class ShippingModule {}
