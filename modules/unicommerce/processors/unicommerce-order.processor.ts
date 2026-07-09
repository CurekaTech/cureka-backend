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
    this.logger.log(`Processing UniCommerce job ${job.name} (${job.id})`);

    switch (job.name) {
      case UNICOMMERCE_JOB_NAMES.PUSH_ORDER:
        return this.unicommerceOrderService.pushOrder(job.data.orderId);
      default:
        throw new Error(`Unsupported UniCommerce job: ${job.name}`);
    }
  }
}
