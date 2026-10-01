import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { BundleAvailabilityService } from '../services/bundle-availability.service';

/**
 * Recalculates bundles that contain the updated product, and the product itself
 * when it is a bundle (covers bundle-item replacement, which emits this event
 * after the component rows are committed).
 */
@Injectable()
export class BundleAvailabilityListener {
  constructor(private readonly bundleAvailabilityService: BundleAvailabilityService) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async handleProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (event.action === 'deleted') return;
    await this.bundleAvailabilityService.recalculateForRefIds([event.refId]);
  }
}
