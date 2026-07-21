import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';

@Injectable()
export class ProductTypesenseListener {
  private readonly logger = new Logger(ProductTypesenseListener.name);

  constructor(private readonly indexer: TypesenseIndexerService) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async handleProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (process.env['BYPASS_PRODUCT_TYPESENSE_LISTENER'] === 'true') {
      return;
    }

    try {
      if (event.action === 'deleted') {
        await this.indexer.removeProduct(event.refId);
        return;
      }

      await this.indexer.syncProduct(event.refId);
    } catch (error) {
      this.logger.error(
        `Typesense product sync failed refId=${event.refId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
