import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { SUBSCRIPTION_QUEUE } from '../constants/subscription-queue.constants';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';

@Injectable()
@Processor(SUBSCRIPTION_QUEUE.PRODUCT_RENEWAL)
export class ProductSubscriptionRenewalProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ProductSubscriptionRenewalProcessor.name);

  constructor(
    private readonly productSubscriptionsService: ProductSubscriptionsService,
    @InjectQueue(SUBSCRIPTION_QUEUE.PRODUCT_RENEWAL)
    private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'daily-renewal',
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'product-subscription-daily-renewal',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ jobId: job.id, name: job.name }, 'Running product subscription renewal job');
    const renewed = await this.productSubscriptionsService.processRenewals();
    const grace = await this.productSubscriptionsService.processGraceAndExpiry();
    this.logger.log({ renewed, grace }, 'Product subscription renewal job completed');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { jobId: job?.id, error: error.message },
      'Product subscription renewal job failed',
    );
  }
}
