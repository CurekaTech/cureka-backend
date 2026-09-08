import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CmsPageUpdatedEvent, EVENTS } from '@packages/events';
import { HomepageService } from '../services/homepage.service';

@Injectable()
export class PublicHomepageCacheListener {
  private readonly logger = new Logger(PublicHomepageCacheListener.name);

  constructor(private readonly homepageService: HomepageService) {}

  @OnEvent(EVENTS.CMS_PAGE_UPDATED)
  async onCmsPageUpdated(_event: CmsPageUpdatedEvent): Promise<void> {
    this.logger.debug('Invalidating public CMS pages cache');
    await this.homepageService.invalidatePublicCmsPagesCache();
  }
}
