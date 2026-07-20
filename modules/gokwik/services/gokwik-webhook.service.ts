import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
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
  constructor(
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
    private readonly apiService: GokwikApiService,
    private readonly dataSource: DataSource,
  ) {}

  receiveTransaction(payload: GokwikTransactionWebhookDto) {
    return this.receiveEvent('transaction', payload.event, payload.data.paymentId, payload);
  }

  receiveRefund(payload: GokwikRefundWebhookDto) {
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
    }
    return { received: payload.carts.length };
  }

  async processEvent(eventId: string): Promise<void> {
    const event = await this.repository.findWebhookEventById(eventId);
    if (!event || event.status === 'processed' || event.status === 'ignored') {
      return;
    }

    try {
      if (event.entity === 'transaction') {
        await this.processTransaction(event.payload as unknown as GokwikTransactionWebhookDto);
      } else if (event.entity === 'refund') {
        await this.processRefund(event.payload as unknown as GokwikRefundWebhookDto);
      } else {
        await this.repository.markWebhookEvent(event.id, 'ignored');
        return;
      }
      await this.repository.markWebhookEvent(event.id, 'processed');
    } catch (error) {
      await this.repository.markWebhookEvent(
        event.id,
        'failed',
        error instanceof Error ? error.message : 'Unknown GoKwik webhook error',
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
      return { received: true, duplicate: false };
    } catch (error) {
      const concurrent = await this.repository.findWebhookEvent(eventKey);
      if (concurrent) {
        return { received: true, duplicate: true };
      }
      throw error;
    }
  }

  private async processTransaction(payload: GokwikTransactionWebhookDto): Promise<void> {
    const data = payload.data;
    const link = await this.repository.findOrderByPaymentId(data.paymentId);
    if (!link?.order) {
      throw new NotFoundException('GoKwik payment is not linked to an order');
    }
    if (
      Math.abs(Math.round(data.amount * 100) - Math.round(Number(link.paymentAmount) * 100)) > 1
    ) {
      throw new BadRequestException('Transaction amount does not match the checkout amount');
    }

    const status = payload.event.toLowerCase();
    let paymentStatus: OrderPaymentStatus;
    if (status.includes('success') || status === 'paid') {
      paymentStatus =
        Number(link.payableOnDelivery) > 0
          ? OrderPaymentStatus.PARTIALLY_PAID
          : OrderPaymentStatus.PAID;
    } else if (status.includes('refund')) {
      paymentStatus = OrderPaymentStatus.REFUNDED;
    } else if (status.includes('fail')) {
      paymentStatus = OrderPaymentStatus.FAILED;
    } else {
      paymentStatus = OrderPaymentStatus.PENDING;
    }

    await this.dataSource.getRepository(OrderEntity).update({ id: link.orderId }, { paymentStatus });
  }

  private async processRefund(payload: GokwikRefundWebhookDto): Promise<void> {
    const data = payload.data;
    const link = await this.repository.findOrderByPaymentId(data.paymentId);
    if (!link?.order) {
      throw new NotFoundException('GoKwik payment is not linked to an order');
    }
    const priorRefunded = await this.repository.sumSuccessfulOrPendingRefunds(
      link.orderId,
      data.refundId,
    );
    if (priorRefunded + data.amount > Number(link.order.grandTotal)) {
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
    const totalRefunded = await this.repository.sumSuccessfulOrPendingRefunds(link.orderId);
    const paymentStatus = normalized.includes('success')
      ? totalRefunded >= Number(link.order.grandTotal)
        ? OrderPaymentStatus.REFUNDED
        : OrderPaymentStatus.PARTIALLY_REFUNDED
      : normalized.includes('pending') || normalized.includes('initiated')
        ? OrderPaymentStatus.REFUND_PENDING
        : link.order.paymentStatus;
    await this.dataSource
      .getRepository(OrderEntity)
      .update({ id: link.orderId }, { paymentStatus });
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
