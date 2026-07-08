import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WatchAndShopUpdatedEvent, EVENTS } from '@packages/events';
import { WatchAndShopCacheSyncService } from '../services/watch-and-shop-cache-sync.service';

@Injectable()
export class WatchAndShopCacheListener {
  private readonly logger = new Logger(WatchAndShopCacheListener.name);

  constructor(private readonly watchAndShopCacheSync: WatchAndShopCacheSyncService) {}

  @OnEvent(EVENTS.WATCH_AND_SHOP_UPDATED)
  async handleWatchAndShopUpdated(event: WatchAndShopUpdatedEvent): Promise<void> {
    await this.watchAndShopCacheSync.invalidateHomepageWatchAndShop();

    this.logger.log(
      `Homepage Watch & Shop cache synchronized (${event.action}) for refId=${event.refId}`,
    );
  }
}
