import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import {
  GOKWIK_JOB_NAMES,
  ProcessGokwikWebhookJobData,
  SyncGokwikResourceJobData,
  PushGokwikFulfillmentJobData,
} from '../constants/gokwik-queue.constants';
import { GokwikCatalogSyncService } from '../services/gokwik-catalog-sync.service';
import { GokwikWebhookService } from '../services/gokwik-webhook.service';
import { GokwikFulfillmentService } from '../services/gokwik-fulfillment.service';

@Injectable()
@Processor(QUEUE_NAMES.GOKWIK)
export class GokwikProcessor extends WorkerHost {
  constructor(
    private readonly webhookService: GokwikWebhookService,
    private readonly catalogSyncService: GokwikCatalogSyncService,
    private readonly fulfillmentService: GokwikFulfillmentService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case GOKWIK_JOB_NAMES.PROCESS_WEBHOOK:
        await this.webhookService.processEvent(
          (job.data as ProcessGokwikWebhookJobData).eventId,
        );
        return;
      case GOKWIK_JOB_NAMES.SYNC_PRODUCT:
        await this.catalogSyncService.syncProduct(
          (job.data as SyncGokwikResourceJobData).resourceId,
        );
        return;
      case GOKWIK_JOB_NAMES.SYNC_COLLECTION:
        await this.catalogSyncService.syncCollection(
          (job.data as SyncGokwikResourceJobData).resourceId,
        );
        return;
      case GOKWIK_JOB_NAMES.PUSH_FULFILLMENT:
        await this.fulfillmentService.pushOrderFulfillment(
          (job.data as PushGokwikFulfillmentJobData).orderId,
        );
        return;
      default:
        throw new Error(`Unsupported GoKwik job: ${job.name}`);
    }
  }
}
