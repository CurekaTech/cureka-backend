import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { AttributeUpdatedEvent, EVENTS } from '@packages/events';

@Injectable()
export class AttributeCacheListener {
  private readonly logger = new Logger(AttributeCacheListener.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.ATTRIBUTE_UPDATED)
  async handleAttributeUpdated(event: AttributeUpdatedEvent): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.attributes.listPattern()],
    });

    this.logger.log(
      `Attribute cache invalidated (${event.action}) for refId=${event.refId}`,
    );
  }
}
