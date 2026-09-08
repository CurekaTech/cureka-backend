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
  bobTrackerStepLabel,
  collectImageRefs,
  isBobDispatchedOrLater,
  mapBobAbandonedCart,
  mapBobEventStatus,
  mapBobFulfillment,
  mapBobOrder,
} from '../mappers/bob.mapper';
import { BobNotifyService } from '../services/bob-notify.service';
import { BobFulfillmentNotifyOutboxService } from '../services/bob-fulfillment-notify-outbox.service';

@Injectable()
export class BobNotifyListener {
  private readonly logger = new Logger(BobNotifyListener.name);

  constructor(
    private readonly bobNotifyService: BobNotifyService,
    private readonly fulfillmentOutbox: BobFulfillmentNotifyOutboxService,
    private readonly ordersRepository: OrdersRepository,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  /** WhatsApp #1: POST /orders-create → order confirmation. */
  @OnEvent(EVENTS.ORDER_CREATED)
  async onOrderCreated(order: Pick<OrderEntity, 'id' | 'orderNumber'>): Promise<void> {
    this.logger.log(
      {
        whatsappSlot: 1,
        whatsappKind: 'order_placed',
        decision: 'call',
        api: '/orders-create',
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
      '[BOB notify] WhatsApp #1 ORDER_CREATED — preparing /orders-create',
    );
    try {
      const full = await this.loadOrder(order.id, order.orderNumber);
      if (!full) {
        this.logger.warn(
          {
            whatsappSlot: 1,
            decision: 'skip',
            reason: 'order_missing',
            api: '/orders-create',
            orderId: order.id,
            orderNumber: order.orderNumber,
          },
          '[BOB notify] WhatsApp #1 skipped — order missing',
        );
        return;
      }
      const shipment = await this.shipmentsRepository.findByOrderId(full.id);
      const imageByKey = await this.signOrderImages(full);
      const payload = mapBobOrder(full, shipment, imageByKey);
      this.logger.log(
        {
          whatsappSlot: 1,
          whatsappKind: 'order_placed',
          decision: 'posting',
          api: '/orders-create',
          orderId: full.id,
          orderNumber: full.orderNumber,
          paymentMethod: full.paymentMethod,
          paymentStatus: full.paymentStatus,
          fullyPaid: payload.fullyPaid,
          phoneMasked: this.maskPhone(full.phoneNumber),
          lineItemCount: payload.lineItems?.length ?? 0,
        },
        '[BOB notify] WhatsApp #1 /orders-create payload ready',
      );
      await this.bobNotifyService.post('/orders-create', payload);
      this.logger.log(
        {
          whatsappSlot: 1,
          whatsappKind: 'order_placed',
          decision: 'posted',
          api: '/orders-create',
          orderId: full.id,
          orderNumber: full.orderNumber,
          paymentMethod: full.paymentMethod,
          paymentStatus: full.paymentStatus,
          fullyPaid: payload.fullyPaid,
          phoneMasked: this.maskPhone(full.phoneNumber),
        },
        '[BOB notify] WhatsApp #1 /orders-create handed to BobNotifyService',
      );
    } catch (error) {
      this.logger.warn(
        {
          whatsappSlot: 1,
          decision: 'error',
          api: '/orders-create',
          orderId: order.id,
          orderNumber: order.orderNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        '[BOB notify] WhatsApp #1 /orders-create crashed (non-blocking) — WhatsApp will not send',
      );
    }
  }

  /** Notifications API: POST /orders-cancelled → BOB sends cancel WhatsApp. */
  @OnEvent(EVENTS.ORDER_CANCELLED)
  async onOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    this.logger.log(
      {
        whatsappKind: 'order_cancelled',
        decision: 'call',
        api: '/orders-cancelled',
        orderId: event.orderId,
        orderNumber: event.orderNumber,
      },
      '[BOB notify] ORDER_CANCELLED — preparing /orders-cancelled',
    );
    try {
      const full = await this.loadOrder(event.orderId, event.orderNumber);
      if (!full) {
        this.logger.warn(
          {
            decision: 'skip',
            reason: 'order_missing',
            api: '/orders-cancelled',
            orderId: event.orderId,
            orderNumber: event.orderNumber,
          },
          '[BOB notify] /orders-cancelled skipped — order missing',
        );
        return;
      }
      const shipment = await this.shipmentsRepository.findByOrderId(full.id);
      const imageByKey = await this.signOrderImages(full);
      await this.bobNotifyService.post('/orders-cancelled', mapBobOrder(full, shipment, imageByKey));
      this.logger.log(
        {
          whatsappKind: 'order_cancelled',
          decision: 'posted',
          api: '/orders-cancelled',
          orderId: full.id,
          orderNumber: full.orderNumber,
        },
        '[BOB notify] /orders-cancelled handed to BobNotifyService',
      );
    } catch (error) {
      this.logger.warn(
        {
          decision: 'error',
          api: '/orders-cancelled',
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        '[BOB notify] /orders-cancelled crashed (non-blocking)',
      );
    }
  }

  /**
   * WhatsApp #2: POST /fulfillments-create once AWB exists and status is Dispatched+.
   * Durable outbox records BOB acceptance separately from WhatsApp delivery.
   * "Not first transition" alone is not proof a message was sent — outbox acceptance is.
   */
  @OnEvent(EVENTS.SHIPMENT_UPDATED)
  async onShipmentUpdated(event: ShipmentUpdatedEvent): Promise<void> {
    const previousStatus = event.previousStatus ?? null;
    this.logger.log(
      {
        trigger: 'EVENTS.SHIPMENT_UPDATED',
        orderId: event.orderId,
        shipmentId: event.shipmentId,
        previousStatus,
        suppressCustomerNotify: Boolean(event.suppressCustomerNotify),
        previousTrackerStep: bobTrackerStepLabel(previousStatus),
      },
      '[BOB notify] SHIPMENT_UPDATED received — evaluating WhatsApp #2 /fulfillments-create',
    );

    if (event.suppressCustomerNotify) {
      this.logger.log(
        {
          whatsappSlot: 2,
          decision: 'skip',
          reason: 'suppress_customer_notify_flag',
          orderId: event.orderId,
          shipmentId: event.shipmentId,
        },
        '[BOB notify] WhatsApp #2 skipped — event suppresses customer notify (GET sync / recovery)',
      );
      return;
    }

    try {
      const shipment = await this.shipmentsRepository.findByOrderId(event.orderId);
      const order = await this.ordersRepository.findByIdOrRefId(event.orderId);
      if (!shipment || !order) {
        this.logger.warn(
          {
            whatsappSlot: 2,
            decision: 'skip',
            reason: 'order_or_shipment_missing',
            orderId: event.orderId,
            shipmentId: event.shipmentId,
          },
          '[BOB notify] WhatsApp #2 skipped — order/shipment missing',
        );
        return;
      }

      const currentStatus = shipment.shipmentStatus;
      const currentTrackerStep = bobTrackerStepLabel(currentStatus);
      const hasAwb = Boolean(shipment.awbNumber);
      const dispatchedOrLater = isBobDispatchedOrLater(currentStatus);
      const enteredDispatched =
        dispatchedOrLater && !isBobDispatchedOrLater(previousStatus);
      const alreadyBlocking = await this.fulfillmentOutbox.hasBlockingFulfillment(order.id);

      if (!hasAwb) {
        this.logger.log(
          {
            whatsappSlot: 2,
            decision: 'skip',
            reason: 'no_awb',
            api: '/fulfillments-create',
            orderId: order.id,
            orderNumber: order.orderNumber,
            shipmentId: shipment.id,
            previousStatus,
            shipmentStatus: currentStatus,
            previousTrackerStep: bobTrackerStepLabel(previousStatus),
            currentTrackerStep,
            hasAwb: false,
          },
          '[BOB notify] WhatsApp #2 skipped — no AWB yet (tracker may still update)',
        );
        return;
      }

      if (!dispatchedOrLater) {
        this.logger.log(
          {
            whatsappSlot: 2,
            decision: 'skip',
            reason: 'not_dispatched_yet',
            api: '/fulfillments-create',
            orderId: order.id,
            orderNumber: order.orderNumber,
            shipmentStatus: currentStatus,
            hasAwb: true,
          },
          '[BOB notify] WhatsApp #2 skipped — status not Dispatched+',
        );
        return;
      }

      if (alreadyBlocking) {
        this.logger.log(
          {
            whatsappSlot: 2,
            decision: 'skip',
            reason: 'outbox_blocking_state',
            api: '/fulfillments-create',
            orderId: order.id,
            orderNumber: order.orderNumber,
            shipmentId: shipment.id,
            enteredDispatched,
            note: 'accepted/suppressed/ambiguous/sending blocks another send',
          },
          '[BOB notify] WhatsApp #2 skipped — fulfillment outbox already blocking',
        );
        return;
      }

      this.logger.log(
        {
          whatsappSlot: 2,
          whatsappKind: 'order_dispatched',
          decision: 'call',
          api: '/fulfillments-create',
          trigger: 'EVENTS.SHIPMENT_UPDATED',
          enteredDispatched,
          lateAwbOrRecovery: !enteredDispatched,
          sources: [
            'Shipway push after place-order',
            'Shipway webhook POST /api/v1/shipments/webhook',
            'Shipway OMS reconciliation',
            'Shipway poll sync',
          ],
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentId: shipment.id,
          previousStatus,
          shipmentStatus: currentStatus,
          previousTrackerStep: bobTrackerStepLabel(previousStatus),
          currentTrackerStep,
          bobShippingStatus: 'shipped',
          mappedEventStatus: mapBobEventStatus(currentStatus),
          hasAwb: true,
          awbNumber: shipment.awbNumber,
          phoneMasked: this.maskPhone(order.phoneNumber),
        },
        '[BOB notify] WhatsApp #2 Dispatched eligible — enqueue durable /fulfillments-create',
      );

      const imageByKey = await this.signOrderImages(order);
      const payload = mapBobFulfillment(order, shipment, imageByKey);
      const result = await this.fulfillmentOutbox.enqueueAndSendFulfillment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentId: shipment.id,
        payload,
      });

      this.logger.log(
        {
          whatsappSlot: 2,
          whatsappKind: 'order_dispatched',
          decision: result.status,
          api: '/fulfillments-create',
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentStatus: currentStatus,
          currentTrackerStep,
          awbNumber: shipment.awbNumber,
          reason: result.reason,
        },
        '[BOB notify] WhatsApp #2 /fulfillments-create outbox finished',
      );
    } catch (error) {
      this.logger.warn(
        {
          whatsappSlot: 2,
          decision: 'error',
          api: '/fulfillments-create',
          orderId: event.orderId,
          shipmentId: event.shipmentId,
          previousStatus,
          error: error instanceof Error ? error.message : String(error),
        },
        '[BOB notify] WhatsApp #2 fulfillment notify crashed (non-blocking)',
      );
    }
  }

  /** Notifications API: POST /abandoned-cart */
  @OnEvent(EVENTS.CHECKOUT_CART_ABANDONED)
  async onCartAbandoned(event: CheckoutCartAbandonedEvent): Promise<void> {
    this.logger.log(
      {
        whatsappKind: 'abandoned_cart',
        decision: 'call',
        api: '/abandoned-cart',
        checkoutId: event.checkoutId,
      },
      '[BOB notify] CHECKOUT_CART_ABANDONED — preparing /abandoned-cart',
    );
    try {
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
    } catch (error) {
      this.logger.warn(
        {
          decision: 'error',
          api: '/abandoned-cart',
          checkoutId: event.checkoutId,
          error: error instanceof Error ? error.message : String(error),
        },
        '[BOB notify] /abandoned-cart crashed (non-blocking)',
      );
    }
  }

  private async loadOrder(id: string, orderNumber: string): Promise<OrderEntity | null> {
    return (
      (await this.ordersRepository.findByOrderNumber(orderNumber)) ??
      (await this.ordersRepository.findByIdOrRefId(id))
    );
  }

  private maskPhone(phone: string | null | undefined): string | null {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 4) return '****';
    return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
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
