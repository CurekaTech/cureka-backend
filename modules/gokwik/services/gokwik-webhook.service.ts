import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CheckoutCartAbandonedEvent, EVENTS } from '@packages/events';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrdersService } from '@modules/orders/services/orders.service';
import {
  resolveOrderStatusUpdate,
  resolvePaymentStatusUpdate,
} from '@modules/orders/utils/payment-status-transition.util';
import { applyOrderStatusTimestamps } from '@modules/orders/utils/order-status-timestamps.util';
import { UnicommerceOrderQueueService } from '@modules/unicommerce/services/unicommerce-order-queue.service';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import {
  GokwikAbandonedCartWebhookDto,
  GokwikRefundWebhookDto,
  GokwikTransactionWebhookDto,
} from '../dto/gokwik-webhook.dto';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikQueueService } from './gokwik-queue.service';

@Injectable()
export class GokwikWebhookService {
  private readonly logger = new Logger(GokwikWebhookService.name);

  constructor(
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
    private readonly apiService: GokwikApiService,
    private readonly dataSource: DataSource,
    private readonly unicommerceOrderQueueService: UnicommerceOrderQueueService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  receiveTransaction(payload: GokwikTransactionWebhookDto) {
    this.logger.log(
      {
        event: payload.event,
        paymentId: payload.data?.paymentId,
        amount: payload.data?.amount,
        hasBodyHmac: Boolean(payload.data?.hmac),
      },
      '[GoKwik-Webhook] transaction event received (persist + queue)',
    );
    return this.receiveEvent('transaction', payload.event, payload.data.paymentId, payload);
  }

  receiveRefund(payload: GokwikRefundWebhookDto) {
    this.logger.log(
      {
        event: payload.event,
        refundId: payload.data?.refundId,
        paymentId: payload.data?.paymentId,
        amount: payload.data?.amount,
        hasBodyHmac: Boolean(payload.data?.hmac),
      },
      '[GoKwik-Webhook] refund event received (persist + queue)',
    );
    return this.receiveEvent('refund', payload.event, payload.data.refundId, payload);
  }

  async receiveAbandonedCarts(payload: GokwikAbandonedCartWebhookDto): Promise<{ received: number }> {
    for (const cart of payload.carts) {
      await this.repository.upsertAbandonedCart({
        externalCartId: cart.cart_id.trim(),
        merchantCartId: cart.merchant_cart_id?.trim() || null,
        requestId: payload.request_id?.trim() || null,
        payload: { ...cart },
        receivedAt: new Date(),
      });
      await this.eventEmitter.emitAsync(
        EVENTS.CHECKOUT_CART_ABANDONED,
        new CheckoutCartAbandonedEvent(
          cart.cart_id.trim(),
          cart.merchant_cart_id?.trim() || null,
          { ...cart },
        ),
      );
    }
    this.logger.log(
      {
        request_id: payload.request_id,
        received: payload.carts.length,
      },
      '[GoKwik-Webhook] abandoned-carts upserted',
    );
    return { received: payload.carts.length };
  }

  /**
   * Outbound Update Order — Platform Order Status. Safe to call after place-order
   * has returned merchant_order_id to GoKwik.
   */
  async pushOrderStatus(
    orderId: string,
    orderStatus: 'Confirmed' | 'Pending' | 'Failed' | 'Cancelled' = 'Confirmed',
  ): Promise<void> {
    const link = await this.repository.findOrderByOrderId(orderId);
    if (!link?.order) {
      this.logger.warn({ orderId, orderStatus }, '[GoKwik] skip status push — no GoKwik order link');
      return;
    }

    const merchantOrderId = link.order.orderNumber;
    this.logger.log(
      {
        orderId,
        merchant_order_id: merchantOrderId,
        order_status: orderStatus,
      },
      '[GoKwik] Pushing Update Order status',
    );

    await this.apiService.updateOrder({
      merchant_order_id: merchantOrderId,
      order_status: orderStatus,
      order_note:
        orderStatus === 'Confirmed'
          ? `Order confirmed after payment | order_id=${merchantOrderId}`
          : `Order status updated to ${orderStatus} | order_id=${merchantOrderId}`,
    });
  }

  async processEvent(eventId: string): Promise<void> {
    const event = await this.repository.findWebhookEventById(eventId);
    if (!event || event.status === 'processed' || event.status === 'ignored') {
      this.logger.log(
        { eventId, status: event?.status ?? 'missing' },
        '[GoKwik-Webhook] process skipped',
      );
      return;
    }

    this.logger.log(
      {
        eventId,
        entity: event.entity,
        event: event.event,
        providerReferenceId: event.providerReferenceId,
        status: event.status,
      },
      '[GoKwik-Webhook] process started',
    );

    try {
      if (event.entity === 'transaction') {
        await this.processTransaction(event.payload as unknown as GokwikTransactionWebhookDto);
      } else if (event.entity === 'refund') {
        await this.processRefund(event.payload as unknown as GokwikRefundWebhookDto);
      } else {
        await this.repository.markWebhookEvent(event.id, 'ignored');
        this.logger.warn(
          { eventId, entity: event.entity },
          '[GoKwik-Webhook] process ignored — unknown entity',
        );
        return;
      }
      await this.repository.markWebhookEvent(event.id, 'processed');
      this.logger.log(
        { eventId, entity: event.entity, event: event.event },
        '[GoKwik-Webhook] process completed',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown GoKwik webhook error';
      await this.repository.markWebhookEvent(event.id, 'failed', message);
      this.logger.error(
        { eventId, entity: event.entity, event: event.event, error: message },
        '[GoKwik-Webhook] process failed',
      );
      throw error;
    }
  }

  async initiateRefund(orderId: string, amount: number, description?: string): Promise<string> {
    const orderLink = await this.dataSource.getRepository(OrderEntity).findOne({ where: { id: orderId } });
    if (!orderLink) {
      throw new NotFoundException('Order not found');
    }
    const alreadyRefunded = await this.repository.sumSuccessfulOrPendingRefunds(orderId);
    const refundable = Number(orderLink.grandTotal) - alreadyRefunded;
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundable) {
      throw new BadRequestException(
        'Refund amount must be positive and cannot exceed the remaining refundable amount',
      );
    }

    const response = await this.apiService.updateOrder({
      merchant_order_id: orderLink.orderNumber,
      refund_amount: amount,
      ...(description ? { order_note: description } : {}),
    });
    const refundId = response.data?.refund_id;
    const paymentId = response.data?.payment_id;
    if (!refundId || !paymentId) {
      throw new BadRequestException('GoKwik did not return refund identifiers');
    }
    await this.repository.upsertRefund({
      orderId,
      refundId,
      paymentId,
      transactionPaymentId: null,
      amount: amount.toFixed(2),
      status: response.data?.status ?? 'initiated',
      auto: false,
      description: description ?? null,
    });
    await this.dataSource
      .getRepository(OrderEntity)
      .update({ id: orderId }, { paymentStatus: OrderPaymentStatus.REFUND_PENDING });
    return refundId;
  }

  private async receiveEvent(
    entity: string,
    eventName: string,
    providerReferenceId: string,
    payload: object,
  ): Promise<{ received: true; duplicate: boolean }> {
    const eventKey = createHash('sha256').update(this.stableJson(payload)).digest('hex');
    const existing = await this.repository.findWebhookEvent(eventKey);
    if (existing) {
      this.logger.log(
        {
          entity,
          event: eventName,
          providerReferenceId,
          existingEventId: existing.id,
          duplicate: true,
        },
        '[GoKwik-Webhook] duplicate ignored',
      );
      return { received: true, duplicate: true };
    }

    try {
      const event = await this.repository.createWebhookEvent({
        eventKey,
        entity,
        event: eventName,
        providerReferenceId,
        payload: payload as Record<string, unknown>,
      });
      await this.queueService.enqueueWebhook(event.id);
      this.logger.log(
        {
          entity,
          event: eventName,
          providerReferenceId,
          eventId: event.id,
          duplicate: false,
        },
        '[GoKwik-Webhook] event persisted and enqueued',
      );
      return { received: true, duplicate: false };
    } catch (error) {
      const concurrent = await this.repository.findWebhookEvent(eventKey);
      if (concurrent) {
        this.logger.log(
          {
            entity,
            event: eventName,
            providerReferenceId,
            existingEventId: concurrent.id,
            duplicate: true,
          },
          '[GoKwik-Webhook] duplicate after race',
        );
        return { received: true, duplicate: true };
      }
      throw error;
    }
  }

  private async processTransaction(payload: GokwikTransactionWebhookDto): Promise<void> {
    const data = payload.data;
    const link = await this.repository.findOrderByPaymentId(data.paymentId);
    if (!link?.order) {
      this.logger.error(
        { paymentId: data.paymentId, event: payload.event, amount: data.amount },
        '[GoKwik-Webhook] transaction — no order linked to paymentId',
      );
      throw new NotFoundException('GoKwik payment is not linked to an order');
    }
    if (
      Math.abs(Math.round(data.amount * 100) - Math.round(Number(link.paymentAmount) * 100)) > 1
    ) {
      this.logger.error(
        {
          paymentId: data.paymentId,
          orderNumber: link.order.orderNumber,
          webhookAmount: data.amount,
          linkedPaymentAmount: link.paymentAmount,
        },
        '[GoKwik-Webhook] transaction — amount mismatch',
      );
      throw new BadRequestException('Transaction amount does not match the checkout amount');
    }

    const status = payload.event.toLowerCase();
    const previousPaymentStatus = link.order.paymentStatus;
    let nextPaymentStatus: OrderPaymentStatus;
    if (status.includes('success') || status === 'paid') {
      nextPaymentStatus =
        Number(link.payableOnDelivery) > 0
          ? OrderPaymentStatus.PARTIALLY_PAID
          : OrderPaymentStatus.PAID;
    } else if (status.includes('refund')) {
      nextPaymentStatus = OrderPaymentStatus.REFUNDED;
    } else if (status.includes('fail')) {
      nextPaymentStatus = OrderPaymentStatus.FAILED;
    } else {
      nextPaymentStatus = OrderPaymentStatus.PENDING;
    }

    const paymentTransition = resolvePaymentStatusUpdate(
      previousPaymentStatus,
      nextPaymentStatus,
    );
    if (paymentTransition.skipped && previousPaymentStatus !== nextPaymentStatus) {
      this.logger.warn(
        {
          paymentId: data.paymentId,
          orderId: link.orderId,
          orderNumber: link.order.orderNumber,
          event: payload.event,
          previousPaymentStatus,
          ignoredPaymentStatus: nextPaymentStatus,
        },
        '[GoKwik-Webhook] transaction ignored — regressive or out-of-order payment status',
      );
      return;
    }

    const orderUpdate: Partial<OrderEntity> = {};
    if (paymentTransition.apply) {
      orderUpdate.paymentStatus = paymentTransition.status;
    }

    const wantsConfirmed = status.includes('success') || status === 'paid';
    let orderBecameConfirmed = false;
    if (wantsConfirmed) {
      const orderTransition = resolveOrderStatusUpdate(
        link.order.orderStatus,
        OrderStatus.CONFIRMED,
      );
      if (orderTransition.apply) {
        orderUpdate.orderStatus = orderTransition.status;
        orderBecameConfirmed = true;
        Object.assign(
          orderUpdate,
          applyOrderStatusTimestamps(link.order, orderTransition.status, new Date()),
        );
      }
    }

    if (Object.keys(orderUpdate).length > 0) {
      await this.dataSource.getRepository(OrderEntity).update({ id: link.orderId }, orderUpdate);
    }

    if (
      wantsConfirmed &&
      (paymentTransition.status === OrderPaymentStatus.PAID ||
        paymentTransition.status === OrderPaymentStatus.PARTIALLY_PAID)
    ) {
      // Do not call Update Order inline — GoKwik often has not stored
      // merchant_order_id yet (webhook races place-order). Delayed job retries.
      await this.queueService.enqueueOrderStatus(link.orderId, 'Confirmed');
      await this.unicommerceOrderQueueService.enqueuePushOrder(link.orderId);
      this.logger.log(
        {
          paymentId: data.paymentId,
          orderId: link.orderId,
          orderNumber: link.order.orderNumber,
          event: payload.event,
          orderStatusPushed: 'Confirmed',
          orderBecameConfirmed,
        },
        '[GoKwik-Webhook] queued delayed updateOrder + UniCommerce push from transaction success',
      );

      // Prepaid CC race: webhook often confirms BEFORE /gokwik/place-order.
      // confirmDraftOrder then skips notify — so fire BOB WhatsApp here on first confirm.
      if (orderBecameConfirmed) {
        this.logger.log(
          {
            paymentId: data.paymentId,
            orderId: link.orderId,
            orderNumber: link.order.orderNumber,
            paymentMethod: link.order.paymentMethod,
            method: data.method,
          },
          '[GoKwik-Webhook] first CONFIRMED via transaction — notifying BOB /orders-create (prepaid WhatsApp)',
        );
        await this.ordersService.notifyOrderPlacedFromExternal(
          link.orderId,
          'gokwik-transaction-webhook',
        );
      } else {
        this.logger.log(
          {
            paymentId: data.paymentId,
            orderId: link.orderId,
            orderNumber: link.order.orderNumber,
            orderStatus: link.order.orderStatus,
          },
          '[GoKwik-Webhook] order already confirmed — skip BOB notify (place-order or prior webhook handled it)',
        );
      }
    }

    this.logger.log(
      {
        paymentId: data.paymentId,
        orderId: link.orderId,
        orderNumber: link.order.orderNumber,
        event: payload.event,
        amount: data.amount,
        previousPaymentStatus,
        nextPaymentStatus: paymentTransition.status,
        paymentStatusApplied: paymentTransition.apply,
      },
      '[GoKwik-Webhook] transaction applied',
    );
  }

  private async processRefund(payload: GokwikRefundWebhookDto): Promise<void> {
    const data = payload.data;
    const link = await this.repository.findOrderByPaymentId(data.paymentId);
    if (!link?.order) {
      this.logger.error(
        {
          paymentId: data.paymentId,
          refundId: data.refundId,
          event: payload.event,
          amount: data.amount,
        },
        '[GoKwik-Webhook] refund — no order linked to paymentId',
      );
      throw new NotFoundException('GoKwik payment is not linked to an order');
    }
    const priorRefunded = await this.repository.sumSuccessfulOrPendingRefunds(
      link.orderId,
      data.refundId,
    );
    if (priorRefunded + data.amount > Number(link.order.grandTotal)) {
      this.logger.error(
        {
          paymentId: data.paymentId,
          refundId: data.refundId,
          orderNumber: link.order.orderNumber,
          refundAmount: data.amount,
          priorRefunded,
          grandTotal: link.order.grandTotal,
        },
        '[GoKwik-Webhook] refund — amount exceeds order total',
      );
      throw new BadRequestException('Refund amount exceeds the order total');
    }

    await this.repository.upsertRefund({
      orderId: link.orderId,
      refundId: data.refundId,
      paymentId: data.paymentId,
      transactionPaymentId: data.transactionPaymentId,
      amount: data.amount.toFixed(2),
      status: payload.event,
      auto: data.auto,
      description: data.refundRequestDescription,
    });

    const normalized = payload.event.toLowerCase();
    const previousPaymentStatus = link.order.paymentStatus;
    const totalRefunded = await this.repository.sumSuccessfulOrPendingRefunds(link.orderId);
    const nextPaymentStatus = normalized.includes('success')
      ? totalRefunded >= Number(link.order.grandTotal)
        ? OrderPaymentStatus.REFUNDED
        : OrderPaymentStatus.PARTIALLY_REFUNDED
      : normalized.includes('pending') || normalized.includes('initiated')
        ? OrderPaymentStatus.REFUND_PENDING
        : link.order.paymentStatus;

    const paymentTransition = resolvePaymentStatusUpdate(
      previousPaymentStatus,
      nextPaymentStatus,
    );
    if (paymentTransition.skipped && previousPaymentStatus !== nextPaymentStatus) {
      this.logger.warn(
        {
          paymentId: data.paymentId,
          refundId: data.refundId,
          orderId: link.orderId,
          orderNumber: link.order.orderNumber,
          event: payload.event,
          previousPaymentStatus,
          ignoredPaymentStatus: nextPaymentStatus,
        },
        '[GoKwik-Webhook] refund ignored — regressive or out-of-order payment status',
      );
      return;
    }

    if (paymentTransition.apply) {
      await this.dataSource
        .getRepository(OrderEntity)
        .update({ id: link.orderId }, { paymentStatus: paymentTransition.status });
    }

    this.logger.log(
      {
        paymentId: data.paymentId,
        refundId: data.refundId,
        orderId: link.orderId,
        orderNumber: link.order.orderNumber,
        event: payload.event,
        amount: data.amount,
        auto: data.auto,
        totalRefunded,
        previousPaymentStatus,
        nextPaymentStatus: paymentTransition.status,
        paymentStatusApplied: paymentTransition.apply,
      },
      '[GoKwik-Webhook] refund applied',
    );
  }

  private stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableJson(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }
}
