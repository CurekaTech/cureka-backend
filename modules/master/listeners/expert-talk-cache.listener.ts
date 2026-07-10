import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ExpertTalkUpdatedEvent, EVENTS } from '@packages/events';
import { ExpertTalkCacheSyncService } from '../services/expert-talk-cache-sync.service';

@Injectable()
export class ExpertTalkCacheListener {
  private readonly logger = new Logger(ExpertTalkCacheListener.name);

  constructor(private readonly expertTalkCacheSync: ExpertTalkCacheSyncService) {}

  @OnEvent(EVENTS.EXPERT_TALK_UPDATED)
  async handleExpertTalkUpdated(event: ExpertTalkUpdatedEvent): Promise<void> {
    await this.expertTalkCacheSync.invalidateHomepageExpertTalks();

    this.logger.log(
      `Homepage Expert Talks cache synchronized (${event.action}) for refId=${event.refId}`,
    );
  }
}
