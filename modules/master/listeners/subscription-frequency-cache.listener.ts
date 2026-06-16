import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { EVENTS, SubscriptionFrequencyUpdatedEvent } from '@packages/events';

@Injectable()
export class SubscriptionFrequencyCacheListener {
  private readonly logger = new Logger(SubscriptionFrequencyCacheListener.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.SUBSCRIPTION_FREQUENCY_UPDATED)
  async handleSubscriptionFrequencyUpdated(
    event: SubscriptionFrequencyUpdatedEvent,
  ): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.subscriptionFrequencies.listPattern()],
    });

    this.logger.log(
      `Subscription frequency cache invalidated (${event.action}) for refId=${event.refId}`,
    );
  }
}
