import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  UNICOMMERCE_JOB_NAMES,
  UnicommerceJobData,
} from '../constants/unicommerce-order-queue.constants';
import { UnicommerceOrderService } from '../services/unicommerce-order.service';

@Processor(QUEUE_NAMES.UNICOMMERCE)
export class UnicommerceOrderProcessor extends WorkerHost {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly unicommerceOrderService: UnicommerceOrderService,
  ) {
    super();
    this.pinoLogger.setContext(UnicommerceOrderProcessor.name);
  }

  async process(job: Job<UnicommerceJobData, unknown, string>): Promise<unknown> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.UNICOMMERCE,
      orderId: job.data.orderId,
    });

    logger.log(
      { attempt: job.attemptsMade + 1 },
      'Processing UniCommerce job',
    );

    try {
      switch (job.name) {
        case UNICOMMERCE_JOB_NAMES.PUSH_ORDER: {
          const result = await this.unicommerceOrderService.pushOrder(job.data.orderId);
          if (result === null) {
            logger.warn(
              { orderId: job.data.orderId, step: 'unicommerce-push' },
              '[FULFILLMENT] UniCommerce push skipped (disabled, misconfigured, or no-op)',
            );
          } else {
            logger.log(
              {
                orderId: job.data.orderId,
                step: 'unicommerce-push',
                successful: result.successful,
                ucOrderCode: result.saleOrderDetailDTO?.code ?? null,
                ucStatus: result.saleOrderDetailDTO?.status ?? null,
                message: result.message ?? null,
              },
              '[FULFILLMENT] UniCommerce push job completed',
            );
          }
          return result;
        }
        default:
          throw new Error(`Unsupported UniCommerce job: ${job.name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          attempt: job.attemptsMade + 1,
          error: message,
        },
        'UniCommerce job failed',
      );
      throw error;
    }
  }
}
