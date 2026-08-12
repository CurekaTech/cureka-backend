import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import {
  GOKWIK_JOB_NAMES,
  ProcessGokwikWebhookJobData,
  SyncGokwikResourceJobData,
  PushGokwikFulfillmentJobData,
  PushGokwikOrderStatusJobData,
} from '../constants/gokwik-queue.constants';
import { GokwikCatalogSyncService } from '../services/gokwik-catalog-sync.service';
import { GokwikWebhookService } from '../services/gokwik-webhook.service';
import { GokwikFulfillmentService } from '../services/gokwik-fulfillment.service';

@Injectable()
@Processor(QUEUE_NAMES.GOKWIK)
export class GokwikProcessor extends WorkerHost {
  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly webhookService: GokwikWebhookService,
    private readonly catalogSyncService: GokwikCatalogSyncService,
    private readonly fulfillmentService: GokwikFulfillmentService,
  ) {
    super();
    this.pinoLogger.setContext(GokwikProcessor.name);
  }

  async process(job: Job): Promise<void> {
    const data = job.data as Record<string, string | undefined>;
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.GOKWIK,
      eventId: data['eventId'],
      resourceId: data['resourceId'],
      orderId: data['orderId'],
    });

    logger.log(
      {
        attempt: job.attemptsMade + 1,
        jobName: job.name,
      },
      'Processing GoKwik job',
    );

    try {
      switch (job.name) {
        case GOKWIK_JOB_NAMES.PROCESS_WEBHOOK: {
          const webhookData = job.data as ProcessGokwikWebhookJobData;
          logger.log(
            { eventId: webhookData.eventId },
            '[GoKwik-Webhook] worker picked up process-webhook job',
          );
          await this.webhookService.processEvent(webhookData.eventId);
          break;
        }
        case GOKWIK_JOB_NAMES.SYNC_PRODUCT:
          await this.catalogSyncService.syncProduct(
            (job.data as SyncGokwikResourceJobData).resourceId,
          );
          break;
        case GOKWIK_JOB_NAMES.SYNC_COLLECTION:
          await this.catalogSyncService.syncCollection(
            (job.data as SyncGokwikResourceJobData).resourceId,
          );
          break;
        case GOKWIK_JOB_NAMES.PUSH_FULFILLMENT:
          await this.fulfillmentService.pushOrderFulfillment(
            (job.data as PushGokwikFulfillmentJobData).orderId,
          );
          break;
        case GOKWIK_JOB_NAMES.PUSH_ORDER_STATUS: {
          const statusData = job.data as PushGokwikOrderStatusJobData;
          await this.webhookService.pushOrderStatus(statusData.orderId, statusData.orderStatus);
          break;
        }
        default:
          throw new Error(`Unsupported GoKwik job: ${job.name}`);
      }
      logger.log('GoKwik job completed');
    } catch (error) {
      logger.error(
        {
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        'GoKwik job failed',
      );
      throw error;
    }
  }
}
