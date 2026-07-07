import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { ShipwayStatusMapper } from '../mappers/shipway-status.mapper';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { IShipwayPushOrderPayload, IShipwayTrackingEvent, IShipwayWebhookEvent } from '../interfaces/shipway-api.interface';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentsRepository } from '../repositories/shipments.repository';
import { ShipmentEventsRepository } from '../repositories/shipment-events.repository';
import { ShipwayService } from './shipway.service';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly ordersRepository: OrdersRepository,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly shipmentEventsRepository: ShipmentEventsRepository,
    private readonly shipwayService: ShipwayService,
  ) {}

  async pushOrderToShipway(orderId: string): Promise<ShipmentEntity | null> {
    const order = await this.ordersRepository.findByIdWithItems(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (!this.isReadyForShipway(order)) {
      this.logger.log(`Skipping Shipway push for order ${order.orderNumber}; order is not ready`);
      return null;
    }

    const existing = await this.shipmentsRepository.findByOrderId(order.id);
    if (existing?.pushedAt) {
      return existing;
    }

    const payload = this.buildPushOrderPayload(order);
    const response = await this.shipwayService.pushOrder(payload);
    if (!response.success) {
      throw new BadRequestException(response.message || 'Shipway rejected order push');
    }

    const rawStatus = response.awb_number ? 'Processing' : 'Confirmed';
    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(rawStatus);

    return this.dataSource.transaction(async (manager) => {
      const shipment =
        existing ??
        (await this.shipmentsRepository.create(
          {
            refId: await generateUniqueRefId('shipment', (candidate) =>
              this.shipmentsRepository.existsByRefId(candidate),
            ),
            orderId: order.id,
            orderNumber: order.orderNumber,
            shipwayOrderId: order.orderNumber,
            warehouseId: payload.warehouse_id ?? null,
            returnWarehouseId: payload.return_warehouse_id ?? null,
            shipmentStatus,
            shipwayRawStatus: rawStatus,
            createdBy: 'shipway-worker',
            updatedBy: 'shipway-worker',
          },
          manager,
        ));

      shipment.shipmentId = this.toNullableString(response.shipment_id);
      shipment.awbNumber = response.awb_number ?? null;
      shipment.courierName = response.courier_name ?? null;
      shipment.courierId = this.toNullableString(response.courier_id);
      shipment.trackingUrl = response.tracking_url ?? null;
      shipment.labelUrl = response.label_url ?? null;
      shipment.invoiceUrl = response.invoice_url ?? null;
      shipment.pickupId = this.toNullableString(response.pickup_id);
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = rawStatus;
      shipment.pushedAt = new Date();
      shipment.lastSyncedAt = new Date();
      shipment.updatedBy = 'shipway-worker';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      const nextOrderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus) ?? OrderStatus.PROCESSING;
      await this.ordersRepository.updateById(order.id, { orderStatus: nextOrderStatus, updatedBy: 'shipway-worker' }, manager);
      return saved;
    });
  }

  async syncShipmentStatus(orderId: string): Promise<ShipmentEntity> {
    const shipment = await this.shipmentsRepository.findByOrderId(orderId);
    if (!shipment) {
      throw new NotFoundException(`Shipment for order ${orderId} not found`);
    }

    const tracking = await this.shipwayService.getShipmentDetails(shipment.shipwayOrderId);
    const rawStatus = tracking.current_status ?? tracking.status ?? shipment.shipwayRawStatus ?? 'Unknown';
    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(rawStatus);

    return this.dataSource.transaction(async (manager) => {
      shipment.awbNumber = tracking.awb_number ?? shipment.awbNumber;
      shipment.courierName = tracking.courier_name ?? shipment.courierName;
      shipment.courierId = this.toNullableString(tracking.courier_id) ?? shipment.courierId;
      shipment.trackingUrl = tracking.tracking_url ?? shipment.trackingUrl;
      shipment.labelUrl = tracking.label_url ?? shipment.labelUrl;
      shipment.invoiceUrl = tracking.invoice_url ?? shipment.invoiceUrl;
      shipment.pickupId = this.toNullableString(tracking.pickup_id) ?? shipment.pickupId;
      shipment.shipmentId = this.toNullableString(tracking.shipment_id) ?? shipment.shipmentId;
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = rawStatus;
      shipment.lastSyncedAt = new Date();
      shipment.updatedBy = 'shipway-sync';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.recordTrackingEvents(saved.id, tracking.events ?? tracking.scans ?? [], 'polling', manager);
      await this.syncOrderStatus(saved.orderId, shipmentStatus, manager);
      return saved;
    });
  }

  async handleShipwayWebhook(payload: IShipwayWebhookEvent): Promise<ShipmentEntity> {
    const shipment = await this.shipmentsRepository.findByShipwayOrderId(payload.order_id);
    if (!shipment) {
      throw new NotFoundException(`Shipment for Shipway order ${payload.order_id} not found`);
    }

    if (payload.event_id && shipment.lastWebhookEventId === payload.event_id) {
      return shipment;
    }

    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(payload.status);
    return this.dataSource.transaction(async (manager) => {
      shipment.awbNumber = payload.awb_number ?? shipment.awbNumber;
      shipment.courierName = payload.courier_name ?? shipment.courierName;
      shipment.courierId = this.toNullableString(payload.courier_id) ?? shipment.courierId;
      shipment.trackingUrl = payload.tracking_url ?? shipment.trackingUrl;
      shipment.labelUrl = payload.label_url ?? shipment.labelUrl;
      shipment.invoiceUrl = payload.invoice_url ?? shipment.invoiceUrl;
      shipment.pickupId = this.toNullableString(payload.pickup_id) ?? shipment.pickupId;
      shipment.shipmentId = this.toNullableString(payload.shipment_id) ?? shipment.shipmentId;
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = payload.status;
      shipment.lastSyncedAt = new Date();
      shipment.lastWebhookEventId = payload.event_id ?? shipment.lastWebhookEventId;
      shipment.updatedBy = 'shipway-webhook';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.recordShipmentEvent(
        saved.id,
        {
          status: payload.status,
          status_date: payload.status_date ?? new Date().toISOString(),
          location: payload.location,
          message: payload.message,
        },
        'webhook',
        manager,
      );
      await this.syncOrderStatus(saved.orderId, shipmentStatus, manager);
      return saved;
    });
  }

  getShipmentByOrderId(orderId: string): Promise<ShipmentEntity | null> {
    return this.shipmentsRepository.findByOrderId(orderId);
  }

  private isReadyForShipway(order: OrderEntity): boolean {
    if ([OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.RTO, OrderStatus.FAILED_DELIVERY].includes(order.orderStatus)) {
      return false;
    }

    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return order.orderStatus !== OrderStatus.PENDING;
    }

    return order.paymentStatus === OrderPaymentStatus.PAID && order.orderStatus !== OrderStatus.PENDING;
  }

  private buildPushOrderPayload(order: OrderEntity): IShipwayPushOrderPayload {
    const [firstName, ...lastNameParts] = order.recipientName.trim().split(/\s+/);
    const warehouseId = this.configService.get<string>('shipway.warehouseId') || undefined;
    const returnWarehouseId =
      this.configService.get<string>('shipway.returnWarehouseId') ||
      warehouseId ||
      undefined;
    const carrierId = this.configService.get<number>('shipway.carrierId');

    return {
      order_id: order.orderNumber,
      payment_type: order.paymentMethod === OrderPaymentMethod.COD ? 'C' : 'P',
      products: order.items.map((item) => ({
        product: item.productName,
        price: item.unitPrice,
        product_code: item.sku,
        product_quantity: String(item.quantity),
      })),
      shipping_firstname: firstName || 'Customer',
      shipping_lastname: lastNameParts.join(' ') || undefined,
      shipping_phone: order.phoneNumber,
      shipping_address: order.addressLine1,
      shipping_address2: order.addressLine2 ?? undefined,
      shipping_city: order.city,
      shipping_state: order.state,
      shipping_zipcode: order.pincode,
      shipping_country: 'India',
      billing_firstname: firstName || 'Customer',
      billing_lastname: lastNameParts.join(' ') || undefined,
      billing_phone: order.phoneNumber,
      billing_address: order.addressLine1,
      billing_address2: order.addressLine2 ?? undefined,
      billing_city: order.city,
      billing_state: order.state,
      billing_zipcode: order.pincode,
      billing_country: 'India',
      order_total: order.grandTotal,
      discount: order.discountAmount,
      shipping: order.shippingAmount,
      carrier_id: carrierId,
      warehouse_id: warehouseId,
      return_warehouse_id: returnWarehouseId,
      order_date: this.formatShipwayDate(order.placedAt ?? order.createdAt),
    };
  }

  private async recordTrackingEvents(
    shipmentId: string,
    events: IShipwayTrackingEvent[],
    source: string,
    manager: Parameters<ShipmentEventsRepository['create']>[1],
  ) {
    for (const event of events) {
      await this.recordShipmentEvent(shipmentId, event, source, manager);
    }
  }

  private async recordShipmentEvent(
    shipmentId: string,
    event: IShipwayTrackingEvent,
    source: string,
    manager: Parameters<ShipmentEventsRepository['create']>[1],
  ) {
    await this.shipmentEventsRepository.create(
      {
        refId: await generateUniqueRefId('shipment-event', (candidate) =>
          this.shipmentEventsRepository.existsByRefId(candidate),
        ),
        shipmentId,
        status: event.status,
        description: event.message ?? event.activity ?? null,
        location: event.location ?? null,
        happenedAt: event.status_date ? new Date(event.status_date) : null,
        source,
        createdBy: source,
        updatedBy: source,
      },
      manager,
    );
  }

  private async syncOrderStatus(
    orderId: string,
    shipmentStatus: ShipmentStatus,
    manager: Parameters<OrdersRepository['updateById']>[2],
  ) {
    const orderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus);
    if (orderStatus) {
      await this.ordersRepository.updateById(orderId, { orderStatus, updatedBy: 'shipway-sync' }, manager);
    }
  }

  private formatShipwayDate(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private toNullableString(value: string | number | undefined): string | null {
    return value === undefined || value === null ? null : String(value);
  }
}
