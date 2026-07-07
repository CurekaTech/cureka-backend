import { Injectable, NotFoundException } from '@nestjs/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { mapShipmentToResponse, ShipmentResponse } from '../mappers/shipment.mapper';
import { ShippingService } from './shipping.service';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly shippingService: ShippingService,
  ) {}

  async getShipmentForOrder(userId: string, orderId: string): Promise<ShipmentResponse | null> {
    const order = await this.ordersRepository.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const shipment = await this.shippingService.getShipmentByOrderId(orderId);
    return shipment ? mapShipmentToResponse(shipment) : null;
  }
}
