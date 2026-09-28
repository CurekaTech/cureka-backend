import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import { AdminNotificationEmailType } from '@modules/admin-settings/enums/admin-notification-email-type.enum';
import { AdminNotificationEmailsService } from '@modules/admin-settings/services/admin-notification-emails.service';
import {
  BundleOosEmailJobData,
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

  async process(job: Job<OosEmailJobData | BundleOosEmailJobData>): Promise<void> {
    const logSku = 'sku' in job.data ? job.data.sku : job.data.bundleSku;
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.OOS_EMAIL,
      sku: logSku,
      attempt: job.attemptsMade + 1,
    });

    if (job.name === OOS_EMAIL_JOB_NAMES.SEND_BUNDLE_OOS) {
      await this.sendBundleOos(job.data as BundleOosEmailJobData, logger);
      return;
    }

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

    const data = job.data as OosEmailJobData;
    const { sku, stock, productName, variantDisplayName, occurredAt } = data;
    const title = productName || variantDisplayName || sku;
    const subject = `[Cureka] Product out of stock: ${sku}`;
    const text = [
      'A product variant transitioned from in-stock to out-of-stock.',
      '',
      `Product: ${title}`,
      `SKU: ${sku}`,
      `Stock: ${stock}`,
      `Occurred at: ${occurredAt}`,
      `Variant ID: ${data.variantId}`,
      `Product ID: ${data.productId}`,
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

  private async sendBundleOos(
    data: BundleOosEmailJobData,
    logger: ReturnType<typeof createJobLogger>,
  ): Promise<void> {
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

    const componentLines = data.components.flatMap((component, index) => {
      const variants = component.variants.length
        ? component.variants
        : [{ sku: '', name: component.name }];
      return variants.map((variant) => ({
        index: index + 1,
        name: component.name,
        sku: variant.sku,
      }));
    });

    const text = [
      `Bundle: ${data.bundleName}`,
      `Bundle SKU: ${data.bundleSku || '—'}`,
      '',
      'The bundle has been marked Out of Stock because the following',
      'included products are Out of Stock:',
      '',
      ...componentLines.map(
        (line) => `${line.index}. ${line.name}\n   SKU: ${line.sku || '—'}`,
      ),
      '',
      data.reason,
      '',
      'The bundle will remain Out of Stock until the required',
      'product/variants become available again.',
    ].join('\n');

    const items = componentLines
      .map(
        (line) =>
          `<li><strong>${escapeHtml(line.name)}</strong><br/>SKU: ${escapeHtml(line.sku || '—')}</li>`,
      )
      .join('');

    const html = `
      <p><strong>Bundle:</strong> ${escapeHtml(data.bundleName)}<br/>
      <strong>Bundle SKU:</strong> ${escapeHtml(data.bundleSku || '—')}</p>
      <p>The bundle has been marked Out of Stock because the following included products are Out of Stock:</p>
      <ol>${items}</ol>
      <p>${escapeHtml(data.reason)}</p>
      <p>The bundle will remain Out of Stock until the required product/variants become available again.</p>
    `;

    const subject = `[Cureka] Bundle out of stock: ${data.bundleSku || data.bundleName}`;
    await this.mailService.send({ to: recipients, subject, text, html });
    logger.log(
      { recipientCount: recipients.length, bundleSku: data.bundleSku },
      'Bundle OOS email sent',
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OosEmailJobData | BundleOosEmailJobData> | undefined, error: Error): void {
    const data = job?.data;
    const sku = data && 'sku' in data ? data.sku : data?.bundleSku;
    this.logger.error(
      {
        jobId: job?.id,
        sku,
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
