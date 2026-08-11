import { Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { DataSource } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';

/**
 * Notifies GoKwik when a Cureka order is cancelled.
 * - Always sends order_status = Cancelled for linked GoKwik orders.
 * - For prepaid / partial-COD with collected online amount, also sends refund_amount
 *   so GoKwik can auto-initiate refund (per Update Order API).
 */
@Injectable()
export class GokwikCancelService {
  private readonly logger = new Logger(GokwikCancelService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: GokwikRepository,
    private readonly apiService: GokwikApiService,
  ) {}

  async notifyOrderCancelled(orderId: string, cancelReason: string): Promise<void> {
    const link = await this.repository.findOrderByOrderId(orderId);
    if (!link?.order) {
      this.logger.log(
        { orderId },
        '[GoKwik-Cancel] skip — order has no GoKwik link',
      );
      return;
    }

    const order = link.order;
    const refundAmount = await this.resolveRefundAmount(
      orderId,
      order.paymentMethod,
      order.paymentStatus,
      order.grandTotal,
      link.prepaidAmount,
    );

    this.logger.log(
      {
        orderId,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        refundAmount: refundAmount ?? null,
      },
      '[GoKwik-Cancel] notifying GoKwik Update Order (Cancelled)',
    );

    try {
      const response = await this.apiService.updateOrder({
        merchant_order_id: order.orderNumber,
        order_status: 'Cancelled',
        order_note: cancelReason?.trim() || 'Order cancelled by customer',
        ...(refundAmount != null ? { refund_amount: refundAmount } : {}),
      });

      if (response.data?.refund_id && response.data?.payment_id && refundAmount != null) {
        await this.repository.upsertRefund({
          orderId,
          refundId: response.data.refund_id,
          paymentId: response.data.payment_id,
          transactionPaymentId: null,
          amount: refundAmount.toFixed(2),
          status: response.data.status ?? 'initiated',
          auto: true,
          description: cancelReason?.trim() || 'Order cancelled',
        });
        await this.dataSource
          .getRepository(OrderEntity)
          .update({ id: orderId }, { paymentStatus: OrderPaymentStatus.REFUND_PENDING });
      }

      this.logger.log(
        {
          orderNumber: order.orderNumber,
          success: response.success,
          refundId: response.data?.refund_id ?? null,
        },
        '[GoKwik-Cancel] GoKwik notified',
      );
    } catch (error) {
      // Local cancel already committed — never fail the customer cancel on GoKwik errors.
      this.logger.error(
        {
          orderId,
          orderNumber: order.orderNumber,
          err: error instanceof Error ? error.message : String(error),
        },
        '[GoKwik-Cancel] failed to notify GoKwik (non-blocking)',
      );
    }
  }

  private async resolveRefundAmount(
    orderId: string,
    paymentMethod: OrderPaymentMethod,
    paymentStatus: OrderPaymentStatus,
    grandTotal: string,
    prepaidAmount: string,
  ): Promise<number | undefined> {
    const collectedOnline =
      paymentStatus === OrderPaymentStatus.PAID ||
      paymentStatus === OrderPaymentStatus.PARTIALLY_PAID ||
      paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED;

    if (!collectedOnline || paymentMethod === OrderPaymentMethod.COD) {
      return undefined;
    }

    const alreadyRefunded = await this.repository.sumSuccessfulOrPendingRefunds(orderId);
    const remaining = Math.max(0, Number(grandTotal) - alreadyRefunded);
    if (remaining <= 0) {
      return undefined;
    }

    if (paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD) {
      const prepaid = Math.max(0, Number(prepaidAmount) || 0);
      const amount = Math.min(prepaid, remaining);
      return amount > 0 ? Math.round(amount * 100) / 100 : undefined;
    }

    // Full prepaid (and other online GoKwik methods): refund remaining order total.
    return Math.round(remaining * 100) / 100;
  }
}
