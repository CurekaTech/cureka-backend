import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { SUBSCRIPTION_QUEUE } from '../constants/subscription-queue.constants';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';
import { AUTOPAY_TRACE, formatIstDate } from '../utils/autopay-trace.util';
import { isSubscriptionsModuleEnabled } from '../utils/subscriptions-module.util';
import { isSubscriptionTestTenuresEnabled } from '../utils/subscription-test-tenures.util';
import { syncTestTenureRenewalJob } from './test-tenure-renewal-job.util';

@Injectable()
@Processor(SUBSCRIPTION_QUEUE.PRODUCT_RENEWAL)
export class ProductSubscriptionRenewalProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ProductSubscriptionRenewalProcessor.name);

  constructor(
    private readonly productSubscriptionsService: ProductSubscriptionsService,
    @InjectQueue(SUBSCRIPTION_QUEUE.PRODUCT_RENEWAL)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
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
    // Daytime passes so Cashfree card (T+2…T+14) and UPI T+1 CHARGE windows are
    // not only attempted at 03:00 — processRenewals also runs scheduleUpcomingCashfreeDebits.
    await this.queue.add(
      'cashfree-advance-pass',
      {},
      {
        repeat: { pattern: '0 8,12,16 * * *' },
        jobId: 'product-subscription-cashfree-advance',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    await syncTestTenureRenewalJob(
      this.queue,
      isSubscriptionTestTenuresEnabled(this.configService),
      'product-subscription-test-tenure-renewal',
    );
  }

  async process(job: Job): Promise<void> {
    if (!isSubscriptionsModuleEnabled(this.configService)) return;
    this.logger.log(
      {
        event: AUTOPAY_TRACE,
        phase: 'renewal_job_start',
        jobId: job.id,
        name: job.name,
        nowIst: formatIstDate(new Date()),
      },
      `${AUTOPAY_TRACE} Running product subscription renewal job`,
    );
    // processRenewals isolates per-subscription errors so one Cashfree 400 cannot
    // abort the rest of the batch. BullMQ still retries the whole job (3 attempts).
    const renewed = await this.productSubscriptionsService.processRenewals();
    const grace = await this.productSubscriptionsService.processGraceAndExpiry();
    this.logger.log(
      {
        event: AUTOPAY_TRACE,
        phase: 'renewal_job_complete',
        jobId: job.id,
        name: job.name,
        renewed,
        grace,
        nowIst: formatIstDate(new Date()),
      },
      `${AUTOPAY_TRACE} Product subscription renewal job completed`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { jobId: job?.id, error: error.message },
      'Product subscription renewal job failed',
    );
  }
}
