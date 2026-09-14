import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  CancelOrderFulfillmentJobData,
  PushOrderToUnicommerceJobData,
  UNICOMMERCE_JOB_NAMES,
} from '../constants/unicommerce-order-queue.constants';

@Injectable()
export class UnicommerceOrderQueueService {
  private readonly logger = new Logger(UnicommerceOrderQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.UNICOMMERCE)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async enqueuePushOrder(orderId: string) {
    if (!this.configService.get<boolean>('unicommerceOrder.enabled')) {
      this.logger.warn(
        `UniCommerce order push disabled (UNICOMMERCE_ORDER_PUSH_ENABLED=false); not enqueuing order ${orderId}`,
      );
      return null;
    }

    const data: PushOrderToUnicommerceJobData = { orderId };
    const job = await this.queue.add(UNICOMMERCE_JOB_NAMES.PUSH_ORDER, data, {
      jobId: `unicommerce-push-${orderId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });

    this.logger.log(
      { orderId, jobId: job.id, queueName: QUEUE_NAMES.UNICOMMERCE },
      'Enqueued UniCommerce order push job',
    );

    return job;
  }

  async getPushJobState(
    orderId: string,
  ): Promise<'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'missing'> {
    const job = await this.queue.getJob(`unicommerce-push-${orderId}`);
    if (!job) return 'missing';
    const state = await job.getState();
    if (
      state === 'waiting' ||
      state === 'active' ||
      state === 'delayed' ||
      state === 'completed' ||
      state === 'failed'
    ) {
      return state;
    }
    return 'missing';
  }

  /**
   * Drops a not-yet-started UniCommerce push so a cancellation cannot race a
   * second create. An already-active or completed push is left for the cancel
   * job to discover via getSaleOrder.
   */
  async cancelPendingPush(orderId: string): Promise<{
    removed: boolean;
    state: string;
  }> {
    const job = await this.queue.getJob(`unicommerce-push-${orderId}`);
    if (!job) {
      return { removed: false, state: 'missing' };
    }
    const state = await job.getState();
    if (state === 'active' || state === 'completed') {
      return { removed: false, state };
    }
    try {
      await job.remove();
      return { removed: true, state };
    } catch (error) {
      this.logger.warn(
        {
          orderId,
          state,
          error: error instanceof Error ? error.message : String(error),
        },
        'Could not remove UniCommerce push job during cancellation',
      );
      return { removed: false, state };
    }
  }

  async enqueueCancelOrder(orderId: string, delayMs = 0) {
    const jobId = `unicommerce-cancel-${orderId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed' || state === 'active') {
        this.logger.log(
          { orderId, jobId, state },
          'UniCommerce cancel job already queued',
        );
        return existing;
      }
      await existing.remove().catch(() => undefined);
    }

    const data: CancelOrderFulfillmentJobData = { orderId };
    const job = await this.queue.add(UNICOMMERCE_JOB_NAMES.CANCEL_ORDER, data, {
      jobId,
      delay: delayMs,
      attempts: 8,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });

    this.logger.log(
      { orderId, jobId: job.id, queueName: QUEUE_NAMES.UNICOMMERCE, delayMs },
      'Enqueued UniCommerce / Shipway fulfilment-cancel job',
    );

    return job;
  }
}
