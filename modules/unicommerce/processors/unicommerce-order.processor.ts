import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  UNICOMMERCE_JOB_NAMES,
  UnicommerceJobData,
} from '../constants/unicommerce-order-queue.constants';
import { UnicommerceOrderService } from '../services/unicommerce-order.service';

@Processor(QUEUE_NAMES.UNICOMMERCE)
export class UnicommerceOrderProcessor extends WorkerHost {
  private readonly logger = new Logger(UnicommerceOrderProcessor.name);

  constructor(private readonly unicommerceOrderService: UnicommerceOrderService) {
    super();
  }

  async process(job: Job<UnicommerceJobData, unknown, string>): Promise<unknown> {
    this.logger.log(
      { jobName: job.name, jobId: job.id, orderId: job.data.orderId, attempt: job.attemptsMade + 1 },
      'Processing UniCommerce job',
    );

    try {
      switch (job.name) {
        case UNICOMMERCE_JOB_NAMES.PUSH_ORDER: {
          const result = await this.unicommerceOrderService.pushOrder(job.data.orderId);
          if (result === null) {
            this.logger.warn(
              { jobId: job.id, orderId: job.data.orderId },
              'UniCommerce push skipped (disabled, misconfigured, or no-op)',
            );
          }
          return result;
        }
        default:
          throw new Error(`Unsupported UniCommerce job: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          jobName: job.name,
          jobId: job.id,
          orderId: job.data.orderId,
          attempt: job.attemptsMade + 1,
          error: message,
        },
        'UniCommerce job failed',
      );
      throw error;
    }
  }
}
