import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, OrderCancelledEvent } from '@packages/events';
import { UnicommerceOrderService } from '../services/unicommerce-order.service';

/**
 * After Cureka cancels an order locally, notify Uniware (pre-dispatch cancel API).
 * Non-blocking: failures are logged and never roll back the Cureka cancel.
 */
@Injectable()
export class UnicommerceOrderCancelListener {
  private readonly logger = new Logger(UnicommerceOrderCancelListener.name);

  constructor(private readonly unicommerceOrderService: UnicommerceOrderService) {}

  @OnEvent(EVENTS.ORDER_CANCELLED)
  async handle(event: OrderCancelledEvent): Promise<void> {
    this.logger.log(
      { orderId: event.orderId, orderNumber: event.orderNumber },
      '[Unicommerce-Cancel] ORDER_CANCELLED received',
    );

    try {
      const response = await this.unicommerceOrderService.cancelSaleOrder({
        orderNumber: event.orderNumber,
        reason: event.cancelReason?.trim() || 'Order cancelled',
      });

      if (!response) {
        this.logger.log(
          { orderNumber: event.orderNumber },
          '[Unicommerce-Cancel] skipped — Unicommerce disabled or not configured',
        );
        return;
      }

      if (!response.successful) {
        this.logger.warn(
          {
            orderNumber: event.orderNumber,
            message: response.message ?? null,
            errors: response.errors,
          },
          '[Unicommerce-Cancel] Uniware rejected cancel (non-blocking)',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          err: error instanceof Error ? error.message : String(error),
        },
        '[Unicommerce-Cancel] failed to call Uniware (non-blocking)',
      );
    }
  }
}
