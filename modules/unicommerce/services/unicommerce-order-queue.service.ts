import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  PushOrderToUnicommerceJobData,
  UNICOMMERCE_JOB_NAMES,
} from '../constants/unicommerce-order-queue.constants';

@Injectable()
export class UnicommerceOrderQueueService {
  private readonly logger = new Logger(UnicommerceOrderQueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.UNICOMMERCE)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async enqueuePushOrder(orderId: string) {
    if (!this.configService.get<boolean>('unicommerceOrder.enabled')) {
      this.logger.log(`UniCommerce order push disabled; not enqueuing order ${orderId}`);
      return null;
    }

    const data: PushOrderToUnicommerceJobData = { orderId };
    return this.queue.add(UNICOMMERCE_JOB_NAMES.PUSH_ORDER, data, {
      jobId: `unicommerce-push-${orderId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
}
