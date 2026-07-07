import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import {
  PushOrderToShipwayJobData,
  SHIPPING_JOB_NAMES,
  SyncShipmentStatusJobData,
} from '../constants/shipping-queue.constants';

@Injectable()
export class ShippingQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.SHIPPING)
    private readonly queue: Queue,
  ) {}

  enqueuePushOrder(orderId: string) {
    console.log(`ShippingQueueService.enqueuePushOrder orderId=${orderId}`);
    const data: PushOrderToShipwayJobData = { orderId };
    return this.queue.add(SHIPPING_JOB_NAMES.PUSH_ORDER_TO_SHIPWAY, data, {
      jobId: `shipway-push-${orderId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }

  enqueueStatusSync(orderId: string) {
    const data: SyncShipmentStatusJobData = { orderId };
    return this.queue.add(SHIPPING_JOB_NAMES.SYNC_SHIPMENT_STATUS, data, {
      jobId: `shipway-sync-${orderId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
}
