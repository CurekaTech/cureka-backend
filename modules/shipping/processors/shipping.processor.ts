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
    this.logger.log(`Processing shipping job ${job.name} (${job.id})`);

    switch (job.name) {
      case SHIPPING_JOB_NAMES.PUSH_ORDER_TO_SHIPWAY:
        return this.shippingService.pushOrderToShipway(job.data.orderId);
      case SHIPPING_JOB_NAMES.SYNC_SHIPMENT_STATUS:
        return this.shippingService.syncShipmentStatus(job.data.orderId);
      default:
        throw new Error(`Unsupported shipping job: ${job.name}`);
    }
  }
}
