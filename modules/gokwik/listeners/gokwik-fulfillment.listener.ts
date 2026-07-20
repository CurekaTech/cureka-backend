import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, ShipmentUpdatedEvent } from '@packages/events';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikQueueService } from '../services/gokwik-queue.service';

@Injectable()
export class GokwikFulfillmentListener {
  constructor(
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
  ) {}

  @OnEvent(EVENTS.SHIPMENT_UPDATED)
  async onShipmentUpdated(event: ShipmentUpdatedEvent): Promise<void> {
    const link = await this.repository.findOrderByOrderId(event.orderId);
    if (link) {
      await this.queueService.enqueueFulfillment(event.orderId);
    }
  }
}
