import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { SUBSCRIPTION_QUEUE } from '../constants/subscription-queue.constants';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';

@Injectable()
@Processor(SUBSCRIPTION_QUEUE.PRODUCT_REMINDER)
export class ProductSubscriptionReminderProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ProductSubscriptionReminderProcessor.name);

  constructor(
    private readonly productSubscriptionsService: ProductSubscriptionsService,
    @InjectQueue(SUBSCRIPTION_QUEUE.PRODUCT_REMINDER)
    private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'daily-reminder',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
        jobId: 'product-subscription-daily-reminder',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ jobId: job.id, name: job.name }, 'Running product subscription reminder job');
    const sent = await this.productSubscriptionsService.processReminders();
    this.logger.log({ sent }, 'Product subscription reminder job completed');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { jobId: job?.id, error: error.message },
      'Product subscription reminder job failed',
    );
  }
}
