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
import { IShipwayPushOrderPayload, IShipwayPushOrderResponse, IShipwayTrackingEvent, IShipwayWebhookEvent } from '../interfaces/shipway-api.interface';
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
    this.logger.log({ orderId }, 'Shipway push started');
    const order = await this.ordersRepository.findByIdWithItems(orderId);
    if (!order) {
      this.logger.warn({ orderId }, 'Shipway push order lookup failed');
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        itemCount: order.items?.length ?? 0,
      },
      'Shipway push order loaded',
    );

    if (!this.isReadyForShipway(order)) {
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        },
        'Skipping Shipway push because order is not ready',
      );
      return null;
    }

    const existing = await this.shipmentsRepository.findByOrderId(order.id);
    if (existing?.pushedAt) {
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, shipmentId: existing.id, pushedAt: existing.pushedAt },
        'Existing shipment already pushed; skipping duplicate Shipway push',
      );
      return existing;
    }

    const payload = this.buildPushOrderPayload(order);
    this.logger.log({ orderId: order.id, orderNumber: order.orderNumber, payload }, 'Built Shipway push payload');
    this.validateShipwayPayload(payload, order);

    let response: IShipwayPushOrderResponse;
    try {
      this.logger.log({ orderId: order.id, orderNumber: order.orderNumber }, 'Calling Shipway push order API');
      response = await this.shipwayService.pushOrder(payload);
    } catch (error) {
      this.logger.error(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          payload,
          error: this.serializeError(error),
        },
        'Shipway push order API threw an exception',
      );
      throw error;
    }

    this.logger.log({ orderId: order.id, orderNumber: order.orderNumber, response }, 'Received Shipway push response');

    if (!response.success) {
      this.logger.warn(
        { orderId: order.id, orderNumber: order.orderNumber, response },
        'Shipway rejected order push',
      );
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
            createdBy: 'shipway-api',
            updatedBy: 'shipway-api',
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
      shipment.updatedBy = 'shipway-api';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentId: saved.id,
          shipwayShipmentId: saved.shipmentId,
          awbNumber: saved.awbNumber,
          shipmentStatus: saved.shipmentStatus,
        },
        'Shipment saved after Shipway push',
      );

      const nextOrderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus) ?? OrderStatus.PROCESSING;
      await this.ordersRepository.updateById(order.id, { orderStatus: nextOrderStatus, updatedBy: 'shipway-api' }, manager);
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, nextOrderStatus },
        'Order updated after Shipway push',
      );
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentId: saved.id,
          shipwayShipmentId: saved.shipmentId,
          awbNumber: saved.awbNumber,
          trackingUrl: saved.trackingUrl,
          shipmentStatus: saved.shipmentStatus,
          nextOrderStatus,
        },
        'Shipway push persisted successfully',
      );
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
      return true;
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
    const parcel = this.buildParcelDetails(order);

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
      order_weight: String(parcel.weightGrams),
      box_length: parcel.lengthCm,
      box_breadth: parcel.breadthCm,
      box_height: parcel.heightCm,
      carrier_id: carrierId,
      warehouse_id: warehouseId,
      return_warehouse_id: returnWarehouseId,
      email: order.user?.email,
      order_date: this.formatShipwayDate(order.placedAt ?? order.createdAt),
    };
  }

  private buildParcelDetails(order: OrderEntity) {
    const fallback = {
      weightGrams: this.getPositiveNumberConfig('shipway.defaultWeightGrams', 500),
      lengthCm: this.getPositiveNumberConfig('shipway.defaultLengthCm', 10),
      breadthCm: this.getPositiveNumberConfig('shipway.defaultBreadthCm', 10),
      heightCm: this.getPositiveNumberConfig('shipway.defaultHeightCm', 5),
    };

    let totalWeightGrams = 0;
    const lengths: number[] = [];
    const breadths: number[] = [];
    const heights: number[] = [];
    const fallbackSkus: string[] = [];

    for (const item of order.items ?? []) {
      const quantity = Math.max(item.quantity, 1);
      const variant = item.variant;
      const itemWeight = this.toWeightGrams(variant?.weight, variant?.weightUnit);
      const itemLength = this.toLengthCm(variant?.length, variant?.lengthUnit);
      const itemBreadth = this.toLengthCm(variant?.width, variant?.widthUnit);
      const itemHeight = this.toLengthCm(variant?.height, variant?.heightUnit);

      if (itemWeight) {
        totalWeightGrams += itemWeight * quantity;
      } else {
        totalWeightGrams += fallback.weightGrams * quantity;
        fallbackSkus.push(item.sku);
      }

      lengths.push(itemLength ?? fallback.lengthCm);
      breadths.push(itemBreadth ?? fallback.breadthCm);
      heights.push(itemHeight ?? fallback.heightCm);
    }

    const parcel = {
      weightGrams: Math.ceil(totalWeightGrams || fallback.weightGrams),
      lengthCm: Math.ceil(Math.max(...lengths, fallback.lengthCm)),
      breadthCm: Math.ceil(Math.max(...breadths, fallback.breadthCm)),
      heightCm: Math.ceil(Math.max(...heights, fallback.heightCm)),
      fallbackSkus,
    };

    this.logger.log(
      { orderId: order.id, orderNumber: order.orderNumber, parcel },
      'Resolved Shipway parcel details',
    );

    return parcel;
  }

  private validateShipwayPayload(payload: IShipwayPushOrderPayload, order: OrderEntity): void {
    const errors: string[] = [];

    this.requireString(payload.order_id, 'order_id', errors);
    if (!['P', 'C'].includes(payload.payment_type)) {
      errors.push(`payment_type must be P or C, received ${payload.payment_type}`);
    }

    if (!payload.products.length) {
      errors.push('products must contain at least one item');
    }

    payload.products.forEach((product, index) => {
      this.requireString(product.product, `products[${index}].product`, errors);
      this.requireString(product.product_code, `products[${index}].product_code`, errors);
      this.requireString(product.price, `products[${index}].price`, errors);
      this.requirePositiveNumber(product.product_quantity, `products[${index}].product_quantity`, errors);
    });

    this.requireString(payload.shipping_firstname, 'shipping_firstname', errors);
    this.requireString(payload.shipping_phone, 'shipping_phone', errors);
    this.requireString(payload.shipping_address, 'shipping_address', errors);
    this.requireString(payload.shipping_city, 'shipping_city', errors);
    this.requireString(payload.shipping_state, 'shipping_state', errors);
    this.requireString(payload.shipping_zipcode, 'shipping_zipcode', errors);
    this.requireString(payload.shipping_country, 'shipping_country', errors);
    this.requirePositiveNumber(payload.order_weight, 'order_weight', errors);
    this.requirePositiveNumber(payload.box_length, 'box_length', errors);
    this.requirePositiveNumber(payload.box_breadth, 'box_breadth', errors);
    this.requirePositiveNumber(payload.box_height, 'box_height', errors);

    if (!/^[6-9]\d{9}$/.test(payload.shipping_phone)) {
      errors.push('shipping_phone must be a valid 10 digit Indian mobile number');
    }

    if (!/^\d{6}$/.test(payload.shipping_zipcode)) {
      errors.push('shipping_zipcode must be a valid 6 digit pincode');
    }

    if (['Address not provided', 'NA'].includes(payload.shipping_address) || ['NA'].includes(payload.shipping_city) || ['NA'].includes(payload.shipping_state)) {
      errors.push('shipping address/city/state must be real customer address values');
    }

    if (!payload.warehouse_id) {
      this.logger.warn(
        { orderId: order.id, orderNumber: order.orderNumber },
        'Shipway warehouse ID is not configured; Shipway may reject label-generation requests',
      );
    }

    const validationLog = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentType: payload.payment_type,
      warehouseId: payload.warehouse_id ?? null,
      returnWarehouseId: payload.return_warehouse_id ?? null,
      parcel: {
        weightGrams: payload.order_weight,
        lengthCm: payload.box_length,
        breadthCm: payload.box_breadth,
        heightCm: payload.box_height,
      },
      address: {
        phone: payload.shipping_phone,
        city: payload.shipping_city,
        state: payload.shipping_state,
        pincode: payload.shipping_zipcode,
      },
      errors,
    };

    if (errors.length) {
      this.logger.warn(validationLog, 'Shipway payload validation failed');
      throw new BadRequestException(`Shipway payload validation failed: ${errors.join('; ')}`);
    }

    this.logger.log(validationLog, 'Shipway payload validation passed');
  }

  private requireString(value: string | undefined, field: string, errors: string[]): void {
    if (!value || !value.trim()) {
      errors.push(`${field} is required`);
    }
  }

  private requirePositiveNumber(value: string | number | undefined, field: string, errors: string[]): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${field} must be a positive number`);
    }
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

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private toWeightGrams(value: string | null | undefined, unit: string | null | undefined): number | null {
    const parsed = this.toPositiveNumber(value);
    if (!parsed) return null;

    const normalizedUnit = unit?.trim().toLowerCase();
    switch (normalizedUnit) {
      case 'kg':
      case 'kilogram':
      case 'kilograms':
        return parsed * 1000;
      case 'mg':
      case 'milligram':
      case 'milligrams':
        return parsed / 1000;
      case 'lb':
      case 'lbs':
      case 'pound':
      case 'pounds':
        return parsed * 453.59237;
      case 'oz':
      case 'ounce':
      case 'ounces':
        return parsed * 28.349523125;
      case 'g':
      case 'gm':
      case 'gram':
      case 'grams':
      default:
        return parsed;
    }
  }

  private toLengthCm(value: string | null | undefined, unit: string | null | undefined): number | null {
    const parsed = this.toPositiveNumber(value);
    if (!parsed) return null;

    const normalizedUnit = unit?.trim().toLowerCase();
    switch (normalizedUnit) {
      case 'mm':
      case 'millimeter':
      case 'millimeters':
        return parsed / 10;
      case 'm':
      case 'meter':
      case 'meters':
        return parsed * 100;
      case 'in':
      case 'inch':
      case 'inches':
        return parsed * 2.54;
      case 'ft':
      case 'foot':
      case 'feet':
        return parsed * 30.48;
      case 'cm':
      case 'centimeter':
      case 'centimeters':
      default:
        return parsed;
    }
  }

  private toPositiveNumber(value: string | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }

  private toNullableString(value: string | number | undefined): string | null {
    return value === undefined || value === null ? null : String(value);
  }
}
