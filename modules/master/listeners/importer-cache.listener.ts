import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { EVENTS, ImporterUpdatedEvent } from '@packages/events';

@Injectable()
export class ImporterCacheListener {
  private readonly logger = new Logger(ImporterCacheListener.name);

  constructor(private readonly cacheStrategy: CacheStrategyService) {}

  @OnEvent(EVENTS.IMPORTER_UPDATED)
  async handleImporterUpdated(event: ImporterUpdatedEvent): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [CacheKeys.importers.listPattern()],
    });

    this.logger.log(
      `Importer cache invalidated (${event.action}) for refId=${event.refId}`,
    );
  }
}
