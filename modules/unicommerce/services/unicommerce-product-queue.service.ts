import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { UNICOMMERCE_PRODUCT_JOB_NAMES } from '../constants/unicommerce-product-queue.constants';

@Injectable()
export class UnicommerceProductQueueService {
  private readonly logger = new Logger(UnicommerceProductQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.UNICOMMERCE_PRODUCTS)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async enqueuePushProduct(productRefId: string, version: string) {
    if (!this.configService.get<boolean>('unicommerceProduct.enabled')) {
      return null;
    }

    const job = await this.queue.add(
      UNICOMMERCE_PRODUCT_JOB_NAMES.PUSH_PRODUCT,
      { productRefId },
      {
        jobId: `unicommerce-product-${productRefId}-${version}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    this.logger.log(
      { productRefId, jobId: job.id },
      'Enqueued UniCommerce product push',
    );
    return job;
  }
}
