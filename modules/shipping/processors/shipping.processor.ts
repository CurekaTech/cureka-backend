import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  SHIPPING_JOB_NAMES,
  ShippingJobData,
} from '../constants/shipping-queue.constants';
import { ShippingService } from '../services/shipping.service';

@Processor(QUEUE_NAMES.SHIPPING)
export class ShippingProcessor extends WorkerHost {
  private readonly logger = new Logger(ShippingProcessor.name);

  constructor(private readonly shippingService: ShippingService) {
    super();
  }

  async process(job: Job<ShippingJobData, unknown, string>): Promise<unknown> {
    console.log(`ShippingProcessor.process start jobName=${job.name} jobId=${job.id}`);
    this.logger.log(`Processing shipping job ${job.name} (${job.id})`);

    let result: unknown;
    switch (job.name) {
      case SHIPPING_JOB_NAMES.PUSH_ORDER_TO_SHIPWAY:
        result = await this.shippingService.pushOrderToShipway(job.data.orderId);
        break;
      case SHIPPING_JOB_NAMES.SYNC_SHIPMENT_STATUS:
        result = await this.shippingService.syncShipmentStatus(job.data.orderId);
        break;
      default:
        throw new Error(`Unsupported shipping job: ${job.name}`);
    }

    this.logger.log({ jobId: job.id, jobName: job.name, result }, 'Shipping job completed');
    console.log(`ShippingProcessor.process completed jobName=${job.name} jobId=${job.id} result=${JSON.stringify(result)}`);
    return result;
  }
}
