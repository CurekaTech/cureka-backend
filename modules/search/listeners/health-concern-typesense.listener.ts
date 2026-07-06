import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, HealthConcernUpdatedEvent } from '@packages/events';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';

@Injectable()
export class HealthConcernTypesenseListener {
  private readonly logger = new Logger(HealthConcernTypesenseListener.name);

  constructor(private readonly indexer: TypesenseIndexerService) {}

  @OnEvent(EVENTS.HEALTH_CONCERN_UPDATED)
  async handleHealthConcernUpdated(event: HealthConcernUpdatedEvent): Promise<void> {
    try {
      if (event.action === 'deleted') {
        await this.indexer.removeHealthConcern(event.refId);
        return;
      }

      await this.indexer.syncHealthConcern(event.refId);
    } catch (error) {
      this.logger.error(
        `Typesense health concern sync failed refId=${event.refId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
