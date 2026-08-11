import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, OrderCancelledEvent } from '@packages/events';
import { GokwikCancelService } from '../services/gokwik-cancel.service';

@Injectable()
export class GokwikCancelListener {
  private readonly logger = new Logger(GokwikCancelListener.name);

  constructor(private readonly cancelService: GokwikCancelService) {}

  @OnEvent(EVENTS.ORDER_CANCELLED)
  async handle(event: OrderCancelledEvent): Promise<void> {
    this.logger.log(
      { orderId: event.orderId, orderNumber: event.orderNumber },
      '[GoKwik-Cancel] ORDER_CANCELLED received',
    );
    await this.cancelService.notifyOrderCancelled(event.orderId, event.cancelReason);
  }
}
