import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Queue } from 'bullmq';
import { AdminNotificationEmailType } from '@modules/admin-settings/enums/admin-notification-email-type.enum';
import { AdminNotificationEmailsService } from '@modules/admin-settings/services/admin-notification-emails.service';
import { VariantOosTransition } from '@modules/product/repositories/product-variants.repository';
import {
  OOS_EMAIL_JOB_NAMES,
  OosEmailJobData,
} from '../constants/oos-email-queue.constants';
import { MailService } from './mail.service';

@Injectable()
export class OosEmailQueueService {
  private readonly logger = new Logger(OosEmailQueueService.name);
  private skipLogged = false;

  constructor(
    @InjectQueue(QUEUE_NAMES.OOS_EMAIL) private readonly queue: Queue,
    private readonly mailService: MailService,
    private readonly notificationEmailsService: AdminNotificationEmailsService,
  ) {}

  async enqueueTransitions(transitions: VariantOosTransition[]): Promise<void> {
    if (!transitions.length) return;

    if (!this.mailService.isConfigured()) {
      this.logSkipOnce('SMTP unset — skipping OOS email enqueue');
      return;
    }

    const recipientCount = await this.notificationEmailsService.countActiveByType(
      AdminNotificationEmailType.PRODUCT_OOS,
    );
    if (recipientCount === 0) {
      this.logSkipOnce('No active product_oos recipients — skipping OOS email enqueue');
      return;
    }

    for (const transition of transitions) {
      await this.enqueueOne(transition);
    }
  }

  /** Fire-and-forget wrapper; never throws to callers. */
  enqueueTransitionsSafe(transitions: VariantOosTransition[]): void {
    if (!transitions.length) return;
    void this.enqueueTransitions(transitions).catch((error: unknown) => {
      this.logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          count: transitions.length,
        },
        'Failed to enqueue OOS email jobs',
      );
    });
  }

  private async enqueueOne(transition: VariantOosTransition): Promise<void> {
    const data: OosEmailJobData = {
      variantId: transition.variantId,
      productId: transition.productId,
      sku: transition.sku,
      stock: transition.stock,
      productName: transition.productName ?? null,
      variantDisplayName: transition.variantDisplayName ?? null,
      occurredAt: transition.occurredAt.toISOString(),
    };

    const jobId = `oos-${transition.variantId}-${transition.occurredAt.getTime()}`;
    await this.queue.add(OOS_EMAIL_JOB_NAMES.SEND_PRODUCT_OOS, data, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    this.logger.log(
      { sku: transition.sku, variantId: transition.variantId, jobId },
      'Enqueued product OOS email job',
    );
  }

  private logSkipOnce(message: string): void {
    if (this.skipLogged) return;
    this.skipLogged = true;
    this.logger.warn(message);
  }
}
