import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  PushProductToUnicommerceJobData,
  UNICOMMERCE_PRODUCT_JOB_NAMES,
} from '../constants/unicommerce-product-queue.constants';
import { UnicommerceProductSyncService } from '../services/unicommerce-product-sync.service';

@Processor(QUEUE_NAMES.UNICOMMERCE_PRODUCTS)
export class UnicommerceProductProcessor extends WorkerHost {
  private readonly logger = new Logger(UnicommerceProductProcessor.name);

  constructor(private readonly syncService: UnicommerceProductSyncService) {
    super();
  }

  async process(
    job: Job<PushProductToUnicommerceJobData, unknown, string>,
  ): Promise<unknown> {
    if (job.name !== UNICOMMERCE_PRODUCT_JOB_NAMES.PUSH_PRODUCT) {
      throw new Error(`Unsupported UniCommerce product job: ${job.name}`);
    }

    try {
      return await this.syncService.pushProduct(job.data.productRefId);
    } catch (error) {
      this.logger.error(
        {
          productRefId: job.data.productRefId,
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        'UniCommerce product push job failed',
      );
      throw error;
    }
  }
}
