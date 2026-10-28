import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BrandUpdatedEvent, EVENTS } from '@packages/events';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';
import { TypesenseQueueService } from '../services/typesense-queue.service';

@Injectable()
export class BrandTypesenseListener {
  private readonly logger = new Logger(BrandTypesenseListener.name);

  constructor(
    private readonly indexer: TypesenseIndexerService,
    private readonly queue: TypesenseQueueService,
  ) {}

  @OnEvent(EVENTS.BRAND_UPDATED)
  async handleBrandUpdated(event: BrandUpdatedEvent): Promise<void> {
    try {
      if (event.action === 'deleted') {
        await this.indexer.removeBrand(event.refId);
        return;
      }

      await this.queue.enqueueBrandReindex(event.refId);
    } catch (error) {
      this.logger.error(
        `Typesense brand reindex failed refId=${event.refId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
