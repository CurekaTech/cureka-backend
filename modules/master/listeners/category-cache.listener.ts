import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CategoryUpdatedEvent, EVENTS } from '@packages/events';
import { CategoriesCacheSyncService } from '../services/categories-cache-sync.service';

@Injectable()
export class CategoryCacheListener {
  private readonly logger = new Logger(CategoryCacheListener.name);

  constructor(private readonly categoriesCacheSync: CategoriesCacheSyncService) {}

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async handleCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    await this.categoriesCacheSync.invalidateListCaches();
    await this.categoriesCacheSync.syncTreeWriteThrough();

    this.logger.log(
      `Category cache synchronized (${event.action}) for refId=${event.refId}`,
    );
  }
}
