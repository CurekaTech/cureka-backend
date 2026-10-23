import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { SUBSCRIPTION_QUEUE } from '../constants/subscription-queue.constants';
import { MembershipsService } from '../services/memberships.service';
import { isSubscriptionsModuleEnabled } from '../utils/subscriptions-module.util';
import { isSubscriptionTestTenuresEnabled } from '../utils/subscription-test-tenures.util';
import { syncTestTenureRenewalJob } from './test-tenure-renewal-job.util';

@Injectable()
@Processor(SUBSCRIPTION_QUEUE.MEMBERSHIP_RENEWAL)
export class MembershipRenewalProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MembershipRenewalProcessor.name);

  constructor(
    private readonly membershipsService: MembershipsService,
    @InjectQueue(SUBSCRIPTION_QUEUE.MEMBERSHIP_RENEWAL)
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
        jobId: 'membership-daily-renewal',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    await syncTestTenureRenewalJob(
      this.queue,
      isSubscriptionTestTenuresEnabled(this.configService),
      'membership-test-tenure-renewal',
    );
  }

  async process(job: Job): Promise<void> {
    if (!isSubscriptionsModuleEnabled(this.configService)) return;
    this.logger.log({ jobId: job.id, name: job.name }, 'Running membership renewal job');
    const renewed = await this.membershipsService.processRenewals();
    this.logger.log({ renewed }, 'Membership renewal job completed');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { jobId: job?.id, error: error.message },
      'Membership renewal job failed',
    );
  }
}
