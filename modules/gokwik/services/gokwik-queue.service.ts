import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import {
  GOKWIK_JOB_NAMES,
  ProcessGokwikWebhookJobData,
  PushGokwikFulfillmentJobData,
  SyncGokwikResourceJobData,
} from '../constants/gokwik-queue.constants';

const DEFAULT_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

@Injectable()
export class GokwikQueueService {
  constructor(@InjectQueue(QUEUE_NAMES.GOKWIK) private readonly queue: Queue) {}

  enqueueWebhook(eventId: string) {
    const data: ProcessGokwikWebhookJobData = { eventId };
    return this.queue.add(GOKWIK_JOB_NAMES.PROCESS_WEBHOOK, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-webhook-${eventId}`,
    });
  }

  enqueueProductSync(resourceId: string) {
    const data: SyncGokwikResourceJobData = { resourceId };
    return this.queue.add(GOKWIK_JOB_NAMES.SYNC_PRODUCT, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-product-${resourceId}`,
    });
  }

  enqueueCollectionSync(resourceId: string) {
    const data: SyncGokwikResourceJobData = { resourceId };
    return this.queue.add(GOKWIK_JOB_NAMES.SYNC_COLLECTION, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-collection-${resourceId}`,
    });
  }

  enqueueFulfillment(orderId: string) {
    const data: PushGokwikFulfillmentJobData = { orderId };
    return this.queue.add(GOKWIK_JOB_NAMES.PUSH_FULFILLMENT, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-fulfillment-${orderId}`,
    });
  }
}
