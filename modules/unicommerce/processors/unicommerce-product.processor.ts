import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  PushProductToUnicommerceJobData,
  UNICOMMERCE_PRODUCT_JOB_NAMES,
} from '../constants/unicommerce-product-queue.constants';
import { UnicommerceProductSyncService } from '../services/unicommerce-product-sync.service';

@Processor(QUEUE_NAMES.UNICOMMERCE_PRODUCTS)
export class UnicommerceProductProcessor extends WorkerHost {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly syncService: UnicommerceProductSyncService,
  ) {
    super();
    this.pinoLogger.setContext(UnicommerceProductProcessor.name);
  }

  async process(
    job: Job<PushProductToUnicommerceJobData, unknown, string>,
  ): Promise<unknown> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.UNICOMMERCE_PRODUCTS,
      productRefId: job.data.productRefId,
    });

    if (job.name !== UNICOMMERCE_PRODUCT_JOB_NAMES.PUSH_PRODUCT) {
      throw new Error(`Unsupported UniCommerce product job: ${job.name}`);
    }

    logger.log(
      { attempt: job.attemptsMade + 1 },
      'Processing UniCommerce product push job',
    );

    try {
      const result = await this.syncService.pushProduct(job.data.productRefId);
      logger.log('UniCommerce product push job completed');
      return result;
    } catch (error) {
      logger.error(
        {
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        'UniCommerce product push job failed',
      );
      throw error;
    }
  }
}
