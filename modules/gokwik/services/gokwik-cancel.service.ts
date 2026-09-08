import { Injectable, Logger } from '@nestjs/common';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';

/**
 * Notifies GoKwik when a Cureka order is cancelled.
 * Always sends order_status = Cancelled for linked GoKwik orders.
 * Does NOT send refund_amount — provider refunds are initiated only after admin approval.
 */
@Injectable()
export class GokwikCancelService {
  private readonly logger = new Logger(GokwikCancelService.name);

  constructor(
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

    this.logger.log(
      {
        orderId,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
      '[GoKwik-Cancel] notifying GoKwik Update Order (Cancelled) without auto refund',
    );

    try {
      const response = await this.apiService.updateOrder({
        merchant_order_id: order.orderNumber,
        order_status: 'Cancelled',
        order_note: cancelReason?.trim() || 'Order cancelled by customer',
      });

      this.logger.log(
        {
          orderNumber: order.orderNumber,
          success: response.success,
        },
        '[GoKwik-Cancel] GoKwik notified',
      );
    } catch (error) {
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
}
