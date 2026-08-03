import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
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

/** Sync jobs: remove promptly so the same product/collection can be re-enqueued. */
const SYNC_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

@Injectable()
export class GokwikQueueService {
  private readonly logger = new Logger(GokwikQueueService.name);

  constructor(@InjectQueue(QUEUE_NAMES.GOKWIK) private readonly queue: Queue) {}

  enqueueWebhook(eventId: string) {
    const data: ProcessGokwikWebhookJobData = { eventId };
    return this.queue.add(GOKWIK_JOB_NAMES.PROCESS_WEBHOOK, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-webhook-${eventId}`,
    });
  }

  async enqueueProductSync(resourceId: string): Promise<void> {
    const data: SyncGokwikResourceJobData = { resourceId };
    const jobId = `gokwik-product-${resourceId}`;
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) return;
    await this.queue.add(GOKWIK_JOB_NAMES.SYNC_PRODUCT, data, {
      ...SYNC_OPTIONS,
      jobId,
    });
  }

  async enqueueCollectionSync(resourceId: string): Promise<void> {
    const data: SyncGokwikResourceJobData = { resourceId };
    const jobId = `gokwik-collection-${resourceId}`;
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) return;
    await this.queue.add(GOKWIK_JOB_NAMES.SYNC_COLLECTION, data, {
      ...SYNC_OPTIONS,
      jobId,
    });
  }

  enqueueFulfillment(orderId: string) {
    const data: PushGokwikFulfillmentJobData = { orderId };
    return this.queue.add(GOKWIK_JOB_NAMES.PUSH_FULFILLMENT, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-fulfillment-${orderId}`,
    });
  }

  /**
   * Fixed jobIds prevent duplicate in-flight work, but BullMQ rejects re-add
   * while a completed/failed job with the same id still exists.
   * @returns false when a job is already active (skip enqueue)
   */
  private async prepareReusableJobId(jobId: string): Promise<boolean> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) return true;

    const state = await existing.getState();
    if (state === 'active') {
      this.logger.debug({ jobId, state }, 'GoKwik sync already active — skip re-enqueue');
      return false;
    }

    // waiting / delayed / completed / failed → remove so we can enqueue fresh
    await existing.remove().catch((error: unknown) => {
      this.logger.warn(
        {
          jobId,
          state,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to remove existing GoKwik sync job before re-enqueue',
      );
    });
    return true;
  }
}
