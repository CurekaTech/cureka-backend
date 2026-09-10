import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import {
  BOB_ABANDONED_CART_JOB,
  BOB_ABANDONED_CART_SCAN_JOB_ID,
  BobAbandonedCartSendJobData,
} from '../constants/bob-abandoned-cart.constants';

@Injectable()
export class BobAbandonedCartQueueService {
  private readonly logger = new Logger(BobAbandonedCartQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BOB_ABANDONED_CART) private readonly queue: Queue,
  ) {}

  async scheduleScan(intervalMs: number): Promise<void> {
    await this.queue.add(
      BOB_ABANDONED_CART_JOB.SCAN,
      {},
      {
        repeat: { every: intervalMs },
        jobId: BOB_ABANDONED_CART_SCAN_JOB_ID,
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    const bootJobId = `${BOB_ABANDONED_CART_SCAN_JOB_ID}-boot`;
    const existingBoot = await this.queue.getJob(bootJobId);
    if (!existingBoot) {
      await this.queue.add(
        BOB_ABANDONED_CART_JOB.SCAN,
        {},
        {
          jobId: bootJobId,
          delay: 15_000,
          removeOnComplete: true,
          removeOnFail: 20,
        },
      );
    }
  }

  async unscheduleScan(): Promise<void> {
    const repeatables = await this.queue.getRepeatableJobs();
    for (const job of repeatables) {
      const isScan =
        job.id === BOB_ABANDONED_CART_SCAN_JOB_ID || job.name === BOB_ABANDONED_CART_JOB.SCAN;
      if (isScan) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }
  }

  async enqueueSend(
    data: BobAbandonedCartSendJobData,
    options?: { attempts?: number },
  ): Promise<boolean> {
    const jobId = `bob-abandoned-cart:send:${data.userId}`;
    const shouldEnqueue = await this.prepareReusableJobId(jobId);
    if (!shouldEnqueue) return false;

    await this.queue.add(BOB_ABANDONED_CART_JOB.SEND, data, {
      jobId,
      attempts: options?.attempts ?? 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
    return true;
  }

  private async prepareReusableJobId(jobId: string): Promise<boolean> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) return true;

    const state = await existing.getState();
    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      this.logger.debug({ jobId, state }, 'Abandoned-cart send already queued — skip re-enqueue');
      return false;
    }

    await existing.remove().catch((error: unknown) => {
      this.logger.warn(
        {
          jobId,
          state,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to remove existing abandoned-cart send job before re-enqueue',
      );
    });
    return true;
  }
}
