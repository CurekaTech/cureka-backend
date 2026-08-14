import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { SUBSCRIPTION_QUEUE } from '../constants/subscription-queue.constants';
import { MembershipsService } from '../services/memberships.service';

@Injectable()
@Processor(SUBSCRIPTION_QUEUE.MEMBERSHIP_REMINDER)
export class MembershipReminderProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MembershipReminderProcessor.name);

  constructor(
    private readonly membershipsService: MembershipsService,
    @InjectQueue(SUBSCRIPTION_QUEUE.MEMBERSHIP_REMINDER)
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
        jobId: 'membership-daily-reminder',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ jobId: job.id, name: job.name }, 'Running membership reminder job');
    const sent = await this.membershipsService.processReminders();
    this.logger.log({ sent }, 'Membership reminder job completed');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      { jobId: job?.id, error: error.message },
      'Membership reminder job failed',
    );
  }
}
