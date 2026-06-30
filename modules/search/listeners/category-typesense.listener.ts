import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CategoryUpdatedEvent, EVENTS } from '@packages/events';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';

@Injectable()
export class CategoryTypesenseListener {
  private readonly logger = new Logger(CategoryTypesenseListener.name);

  constructor(private readonly indexer: TypesenseIndexerService) {}

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async handleCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    try {
      await this.indexer.reindexByCategoryRefId(event.refId);
    } catch (error) {
      this.logger.error(
        `Typesense category reindex failed refId=${event.refId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
