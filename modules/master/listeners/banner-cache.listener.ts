import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BannerUpdatedEvent, EVENTS } from '@packages/events';
import { BannersCacheSyncService } from '../services/banners-cache-sync.service';

@Injectable()
export class BannerCacheListener {
  private readonly logger = new Logger(BannerCacheListener.name);

  constructor(private readonly bannersCacheSync: BannersCacheSyncService) {}

  @OnEvent(EVENTS.BANNER_UPDATED)
  async handleBannerUpdated(event: BannerUpdatedEvent): Promise<void> {
    await this.bannersCacheSync.invalidateHomepageBanners();
    await this.bannersCacheSync.syncHomepageBannersWriteThrough();

    this.logger.log(
      `Homepage banner cache synchronized (${event.action}) for refId=${event.refId}`,
    );
  }
}
