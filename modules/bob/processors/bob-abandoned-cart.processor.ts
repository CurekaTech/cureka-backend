import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  BOB_ABANDONED_CART_JOB,
  BobAbandonedCartSendJobData,
} from '../constants/bob-abandoned-cart.constants';
import { BobAbandonedCartNotifyService } from '../services/bob-abandoned-cart-notify.service';
import { BobAbandonedCartQueueService } from '../services/bob-abandoned-cart-queue.service';

const concurrency = Math.max(
  1,
  parseInt(process.env['BOB_ABANDONED_CART_CONCURRENCY'] ?? '2', 10) || 2,
);

@Injectable()
@Processor(QUEUE_NAMES.BOB_ABANDONED_CART, { concurrency })
export class BobAbandonedCartProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BobAbandonedCartProcessor.name);

  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly notifyService: BobAbandonedCartNotifyService,
    private readonly queueService: BobAbandonedCartQueueService,
  ) {
    super();
    this.pinoLogger.setContext(BobAbandonedCartProcessor.name);
  }

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>('bob.abandonedCart.enabled') ?? true;
    const configured = this.notifyService.isNotifyConfigured();

    if (!enabled) {
      await this.queueService.unscheduleScan();
      this.logger.log(
        '[BOB abandoned-cart] scheduler idle — set BOB_ABANDONED_CART_ENABLED=true to start',
      );
      return;
    }

    if (!configured) {
      await this.queueService.unscheduleScan();
      this.logger.warn(
        '[BOB abandoned-cart] scheduler idle — BOB_NOTIFY_URL and BOB_GUEST_ID are required',
      );
      return;
    }

    const intervalMs = this.notifyService.settings().scanIntervalMs;
    await this.queueService.scheduleScan(intervalMs);
    this.logger.log(
      {
        queue: QUEUE_NAMES.BOB_ABANDONED_CART,
        scanIntervalMinutes: intervalMs / 60_000,
        concurrency,
      },
      '[BOB abandoned-cart] repeating scan registered — starts with this API process',
    );
  }

  async process(job: Job): Promise<void> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.BOB_ABANDONED_CART,
      attempt: job.attemptsMade + 1,
    });

    if (job.name === BOB_ABANDONED_CART_JOB.SCAN) {
      const summary = await this.notifyService.scanAndEnqueue();
      logger.log(summary, '[BOB abandoned-cart] scan job finished');
      return;
    }

    if (job.name === BOB_ABANDONED_CART_JOB.SEND) {
      const data = job.data as BobAbandonedCartSendJobData;
      const result = await this.notifyService.processSend(data);
      logger.log(
        {
          outboxId: data.outboxId,
          cartRefId: data.cartRefId,
          status: result.status,
          reason: result.reason,
        },
        '[BOB abandoned-cart] send job finished',
      );
      if (result.status === 'retry') {
        throw new Error(result.reason || 'retryable_bob_error');
      }
      return;
    }

    throw new Error(`Unsupported abandoned-cart job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        error: error.message,
      },
      '[BOB abandoned-cart] job failed',
    );
  }
}
