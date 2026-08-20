import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { StorageService } from '@packages/storage';
import {
  CheckoutCartAbandonedEvent,
  EVENTS,
  OrderCancelledEvent,
  ShipmentUpdatedEvent,
} from '@packages/events';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import {
  collectImageRefs,
  mapBobAbandonedCart,
  mapBobFulfillment,
  mapBobOrder,
} from '../mappers/bob.mapper';
import { BobNotifyService } from '../services/bob-notify.service';

@Injectable()
export class BobNotifyListener {
  private readonly logger = new Logger(BobNotifyListener.name);

  constructor(
    private readonly bobNotifyService: BobNotifyService,
    private readonly ordersRepository: OrdersRepository,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  /** Notifications API: POST /orders-create → BOB sends order-confirmation WhatsApp. */
  @OnEvent(EVENTS.ORDER_CREATED, { async: true })
  async onOrderCreated(order: Pick<OrderEntity, 'id' | 'orderNumber'>): Promise<void> {
    const full = await this.loadOrder(order.id, order.orderNumber);
    if (!full) {
      this.logger.warn(
        { orderId: order.id, orderNumber: order.orderNumber },
        '[BOB notify] order created but order missing — /orders-create skipped',
      );
      return;
    }
    const shipment = await this.shipmentsRepository.findByOrderId(full.id);
    const imageByKey = await this.signOrderImages(full);
    await this.bobNotifyService.post('/orders-create', mapBobOrder(full, shipment, imageByKey));
  }

  /** Notifications API: POST /orders-cancelled → BOB sends cancel WhatsApp. */
  @OnEvent(EVENTS.ORDER_CANCELLED, { async: true })
  async onOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    const full = await this.loadOrder(event.orderId, event.orderNumber);
    if (!full) {
      this.logger.warn(
        { orderId: event.orderId, orderNumber: event.orderNumber },
        '[BOB notify] order cancelled but order missing — /orders-cancelled skipped',
      );
      return;
    }
    const shipment = await this.shipmentsRepository.findByOrderId(full.id);
    const imageByKey = await this.signOrderImages(full);
    await this.bobNotifyService.post('/orders-cancelled', mapBobOrder(full, shipment, imageByKey));
  }

  /**
   * Notifications API: POST /fulfillments-create (shipped / AWB).
   * Custom stores: do not call /fulfillments-events-create.
   */
  @OnEvent(EVENTS.SHIPMENT_UPDATED)
  async onShipmentUpdated(event: ShipmentUpdatedEvent): Promise<void> {
    const shipment = await this.shipmentsRepository.findByOrderId(event.orderId);
    const order = await this.ordersRepository.findByIdOrRefId(event.orderId);
    if (!shipment || !order) {
      this.logger.warn(
        { orderId: event.orderId, shipmentId: event.shipmentId },
        '[BOB notify] shipment updated but order/shipment missing',
      );
      return;
    }
    if (!shipment.awbNumber) {
      return;
    }
    const imageByKey = await this.signOrderImages(order);
    await this.bobNotifyService.post(
      '/fulfillments-create',
      mapBobFulfillment(order, shipment, imageByKey),
    );
  }

  /** Notifications API: POST /abandoned-cart */
  @OnEvent(EVENTS.CHECKOUT_CART_ABANDONED)
  async onCartAbandoned(event: CheckoutCartAbandonedEvent): Promise<void> {
    const storefront =
      this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ?? '';
    const recoveryUrl = storefront ? `${storefront}/cart` : '';
    await this.bobNotifyService.post(
      '/abandoned-cart',
      mapBobAbandonedCart({
        checkoutId: event.checkoutId,
        recoveryUrl,
        payload: event.payload,
      }),
    );
  }

  private async loadOrder(id: string, orderNumber: string): Promise<OrderEntity | null> {
    return (
      (await this.ordersRepository.findByOrderNumber(orderNumber)) ??
      (await this.ordersRepository.findByIdOrRefId(id))
    );
  }

  private async signOrderImages(order: OrderEntity): Promise<Map<string, string>> {
    const products = (order.items ?? [])
      .map((item) => item.product)
      .filter((product): product is ProductEntity => Boolean(product));
    const refs = products.flatMap(collectImageRefs);
    const unique = [...new Map(refs.map((ref) => [ref.key, ref])).values()];
    if (!unique.length) {
      return new Map();
    }
    const signed = await this.storageService.toFileReferenceResponses(unique);
    const imageByKey = new Map<string, string>();
    unique.forEach((ref, index) => {
      const url = signed[index]?.url;
      if (url) {
        imageByKey.set(ref.key, url);
      }
    });
    return imageByKey;
  }
}
