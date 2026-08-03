import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import {
  mapDefaultShipmentResponse,
  mapShipmentToResponse,
  ShipmentResponse,
} from '../mappers/shipment.mapper';
import { ShippingService } from './shipping.service';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly shippingService: ShippingService,
  ) {}

  async getShipmentForOrder(userId: string, orderId: string): Promise<ShipmentResponse> {
    this.logger.log(
      { userId, orderId },
      '[Shipway] Shipment API requested',
    );

    const order = await this.ordersRepository.findByIdAndUserId(orderId, userId);
    if (!order) {
      this.logger.warn({ userId, orderId }, '[Shipway] Order not found for shipment lookup');
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        recipientName: order.recipientName,
        phoneNumber: order.phoneNumber,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        itemCount: order.items?.length ?? 0,
        items: (order.items ?? []).map((item) => ({
          sku: item.sku,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        createdAt: order.createdAt,
      },
      '[Shipway] Order details loaded for shipment status',
    );

    const { shipment, shipwayStatus } = await this.shippingService.resolveShipmentForOrder(
      orderId,
      order.orderNumber,
    );

    if (!shipment) {
      const response = mapDefaultShipmentResponse(order);
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          shipwayStatus: response.shipwayStatus,
          currentStatusLabel: response.currentStatusLabel,
          statusFlow: response.statusFlow,
        },
        '[Shipway] No Shipway data — returning default 4-step flow from order status',
      );
      return response;
    }

    const response = mapShipmentToResponse(shipment, {
      shipwayStatus,
      orderStatus: order.orderStatus,
    });
    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        shipwayStatus: response.shipwayStatus,
        shipmentStatus: response.shipmentStatus,
        shipwayRawStatus: response.shipwayRawStatus,
        awbNumber: response.awbNumber,
        courierName: response.courierName,
        trackingUrl: response.trackingUrl,
        currentStatusLabel: response.currentStatusLabel,
        statusFlow: response.statusFlow,
        eventCount: response.events?.length ?? 0,
      },
      '[Shipway] Shipment API response ready',
    );
    return response;
  }
}
