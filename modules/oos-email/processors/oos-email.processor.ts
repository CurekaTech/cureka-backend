import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import { AdminNotificationEmailType } from '@modules/admin-settings/enums/admin-notification-email-type.enum';
import { AdminNotificationEmailsService } from '@modules/admin-settings/services/admin-notification-emails.service';
import {
  OOS_EMAIL_JOB_NAMES,
  OosEmailJobData,
} from '../constants/oos-email-queue.constants';
import { MailService } from '../services/mail.service';

@Injectable()
@Processor(QUEUE_NAMES.OOS_EMAIL, { concurrency: 2 })
export class OosEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(OosEmailProcessor.name);

  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly mailService: MailService,
    private readonly notificationEmailsService: AdminNotificationEmailsService,
  ) {
    super();
    this.pinoLogger.setContext(OosEmailProcessor.name);
  }

  async process(job: Job<OosEmailJobData>): Promise<void> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.OOS_EMAIL,
      sku: job.data.sku,
      attempt: job.attemptsMade + 1,
    });

    if (job.name !== OOS_EMAIL_JOB_NAMES.SEND_PRODUCT_OOS) {
      logger.warn({ jobName: job.name }, 'Unknown OOS email job name — skipping');
      return;
    }

    const recipients = await this.notificationEmailsService.findActiveEmailsByType(
      AdminNotificationEmailType.PRODUCT_OOS,
    );
    if (!recipients.length) {
      logger.warn('No active product_oos recipients — skipping send');
      return;
    }

    if (!this.mailService.isConfigured()) {
      throw new Error('SMTP is not configured');
    }

    const { sku, stock, productName, variantDisplayName, occurredAt } = job.data;
    const title = productName || variantDisplayName || sku;
    const subject = `[Cureka] Product out of stock: ${sku}`;
    const text = [
      'A product variant transitioned from in-stock to out-of-stock.',
      '',
      `Product: ${title}`,
      `SKU: ${sku}`,
      `Stock: ${stock}`,
      `Occurred at: ${occurredAt}`,
      `Variant ID: ${job.data.variantId}`,
      `Product ID: ${job.data.productId}`,
    ].join('\n');

    const html = `
      <p>A product variant transitioned from <strong>in-stock</strong> to <strong>out-of-stock</strong>.</p>
      <ul>
        <li><strong>Product:</strong> ${escapeHtml(title)}</li>
        <li><strong>SKU:</strong> ${escapeHtml(sku)}</li>
        <li><strong>Stock:</strong> ${stock}</li>
        <li><strong>Occurred at:</strong> ${escapeHtml(occurredAt)}</li>
      </ul>
    `;

    await this.mailService.send({ to: recipients, subject, text, html });
    logger.log({ recipientCount: recipients.length, sku }, 'OOS email sent');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OosEmailJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id,
        sku: job?.data?.sku,
        attemptsMade: job?.attemptsMade,
        err: error.message,
      },
      'OOS email job failed',
    );
  }
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
