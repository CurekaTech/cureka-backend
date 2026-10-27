import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import {
  GOKWIK_JOB_NAMES,
  ProcessGokwikWebhookJobData,
  PushGokwikFulfillmentJobData,
  PushGokwikOrderStatusJobData,
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

  /**
   * One deterministic job per category. Waiting and delayed jobs already read the
   * database at execution time, so they are left in place. An active job cannot
   * be replaced; a single follow-up job covers a newer membership change.
   */
  async enqueueCollectionSync(resourceId: string): Promise<void> {
    const canonicalId = `gokwik-collection-${resourceId}`;
    const followUpId = `${canonicalId}-after`;
    const canonical = await this.queue.getJob(canonicalId);

    if (!canonical) {
      await this.addCollectionJob(canonicalId, resourceId);
      return;
    }

    const state = await canonical.getState();
    if (state === 'waiting' || state === 'delayed') {
      return;
    }

    if (state === 'active') {
      await this.ensureCollectionFollowUp(followUpId, resourceId);
      return;
    }

    await this.removeJobQuietly(canonical);
    const followUp = await this.queue.getJob(followUpId);
    if (followUp && (await followUp.getState()) === 'active') {
      await this.addCollectionJob(canonicalId, resourceId);
      return;
    }
    await this.addCollectionJob(canonicalId, resourceId);
  }

  enqueueFulfillment(orderId: string) {
    const data: PushGokwikFulfillmentJobData = { orderId };
    return this.queue.add(GOKWIK_JOB_NAMES.PUSH_FULFILLMENT, data, {
      ...DEFAULT_OPTIONS,
      jobId: `gokwik-fulfillment-${orderId}`,
    });
  }

  /**
   * Push merchant order_status after GoKwik has stored merchant_order_id.
   * Delayed because transaction webhooks often arrive during / before place-order,
   * when Update Order is a no-op on GoKwik's side.
   */
  async enqueueOrderStatus(
    orderId: string,
    orderStatus: PushGokwikOrderStatusJobData['orderStatus'] = 'Confirmed',
    delayMs = 5_000,
  ): Promise<void> {
    const data: PushGokwikOrderStatusJobData = { orderId, orderStatus };
    const jobId = `gokwik-order-status-${orderId}-${orderStatus}`;
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) return;
    await this.queue.add(GOKWIK_JOB_NAMES.PUSH_ORDER_STATUS, data, {
      ...DEFAULT_OPTIONS,
      jobId,
      delay: delayMs,
    });
    this.logger.log(
      { orderId, orderStatus, delayMs, jobId },
      '[GoKwik] Enqueued delayed Update Order status push',
    );
  }

  private async addCollectionJob(jobId: string, resourceId: string): Promise<void> {
    const data: SyncGokwikResourceJobData = { resourceId };
    try {
      await this.queue.add(GOKWIK_JOB_NAMES.SYNC_COLLECTION, data, {
        ...SYNC_OPTIONS,
        jobId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(message)) return;
      throw error;
    }
  }

  private async ensureCollectionFollowUp(followUpId: string, resourceId: string): Promise<void> {
    const existing = await this.queue.getJob(followUpId);
    if (!existing) {
      await this.addCollectionJob(followUpId, resourceId);
      return;
    }
    const state = await existing.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') {
      return;
    }
    await this.removeJobQuietly(existing);
    await this.addCollectionJob(followUpId, resourceId);
  }

  private async removeJobQuietly(job: { remove: () => Promise<void> }): Promise<void> {
    await job.remove().catch((error: unknown) => {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to remove existing GoKwik collection job before re-enqueue',
      );
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
