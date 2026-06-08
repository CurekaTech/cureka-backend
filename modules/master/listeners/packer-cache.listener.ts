import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { EVENTS, PackerUpdatedEvent } from '@packages/events';

@Injectable()
export class PackerCacheListener {
  private readonly logger = new Logger(PackerCacheListener.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.PACKER_UPDATED)
  async handlePackerUpdated(event: PackerUpdatedEvent): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.packers.listPattern()],
    });

    this.logger.log(
      `Packer cache invalidated (${event.action}) for refId=${event.refId}`,
    );
  }
}
