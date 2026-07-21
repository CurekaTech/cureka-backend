import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TestimonialUpdatedEvent, EVENTS } from '@packages/events';
import { TestimonialCacheSyncService } from '../services/testimonial-cache-sync.service';

@Injectable()
export class TestimonialCacheListener {
  private readonly logger = new Logger(TestimonialCacheListener.name);

  constructor(private readonly testimonialCacheSync: TestimonialCacheSyncService) {}

  @OnEvent(EVENTS.TESTIMONIAL_UPDATED)
  async handleTestimonialUpdated(event: TestimonialUpdatedEvent): Promise<void> {
    await this.testimonialCacheSync.invalidateHomepageTestimonials();

    this.logger.log(
      `Homepage Testimonials cache synchronized (${event.action}) for refId=${event.refId}`,
    );
  }
}
