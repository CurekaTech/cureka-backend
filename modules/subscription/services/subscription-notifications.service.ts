import { Injectable, Logger } from '@nestjs/common';
import { Msg91SmsService } from '@modules/notifications/services/msg91-sms.service';
import { MailService } from '@modules/oos-email/services/mail.service';
import { UsersRepository } from '@modules/users/repositories/users.repository';

export type RenewalReminderEmailParams = {
  userId: string;
  kind: 'product_subscription' | 'membership';
  paymentLink: string;
  amount: string;
  currency?: string;
  daysBefore: number;
  scheduledRenewalDate: string;
  productName?: string | null;
  variantName?: string | null;
  sku?: string | null;
  refId?: string;
  autopayEnabled?: boolean;
};

@Injectable()
export class SubscriptionNotificationsService {
  private readonly logger = new Logger(SubscriptionNotificationsService.name);

  constructor(
    private readonly msg91SmsService: Msg91SmsService,
    private readonly usersRepository: UsersRepository,
    private readonly mailService: MailService,
  ) {}

  notifyPaymentLinkCreated(params: {
    userId: string;
    kind: 'product_subscription' | 'membership';
    paymentLink: string;
    amount: string;
    refId?: string;
  }): void {
    void this.sendSafely('payment-link-created', params.userId, async (phone) => {
      await this.sendSmsOrLog(phone, {
        kind: params.kind,
        event: 'payment_link',
        amount: params.amount,
        paymentLink: params.paymentLink,
        refId: params.refId,
      });
    });
  }

  notifyActivated(params: {
    userId: string;
    kind: 'product_subscription' | 'membership';
    refId?: string;
  }): void {
    void this.sendSafely('activated', params.userId, async (phone) => {
      await this.sendSmsOrLog(phone, {
        kind: params.kind,
        event: 'activated',
        refId: params.refId,
      });
    });
  }

  notifyCancelled(params: {
    userId: string;
    kind: 'product_subscription' | 'membership';
    refId?: string;
  }): void {
    void this.sendSafely('cancelled', params.userId, async (phone) => {
      await this.sendSmsOrLog(phone, {
        kind: params.kind,
        event: 'cancelled',
        refId: params.refId,
      });
    });
  }

  notifyRenewalDue(params: {
    userId: string;
    kind: 'product_subscription' | 'membership';
    paymentLink: string;
    amount: string;
    refId?: string;
  }): void {
    void this.sendSafely('renewal-due', params.userId, async (phone) => {
      await this.sendSmsOrLog(phone, {
        kind: params.kind,
        event: 'renewal_due',
        amount: params.amount,
        paymentLink: params.paymentLink,
        refId: params.refId,
      });
    });
  }

  /**
   * @deprecated Prefer {@link sendRenewalReminderEmail} for product subscriptions.
   * Kept for membership SMS stub compatibility.
   */
  notifyReminder(params: {
    userId: string;
    kind: 'product_subscription' | 'membership';
    paymentLink?: string | null;
    daysBefore: number;
    refId?: string;
  }): void {
    void this.sendSafely('reminder', params.userId, async (phone) => {
      await this.sendSmsOrLog(phone, {
        kind: params.kind,
        event: 'reminder',
        daysBefore: String(params.daysBefore),
        paymentLink: params.paymentLink ?? undefined,
        refId: params.refId,
      });
    });
  }

  /**
   * Sends the early-renewal reminder email. Returns false when SMTP is down,
   * the user has no email, or the payment link is missing — callers must not
   * record reminder idempotency until this returns true.
   */
  async sendRenewalReminderEmail(params: RenewalReminderEmailParams): Promise<boolean> {
    if (!params.paymentLink?.trim()) {
      this.logger.warn(
        { userId: params.userId, refId: params.refId, daysBefore: params.daysBefore },
        'Renewal reminder skipped — payment link missing',
      );
      return false;
    }
    if (!this.mailService.isConfigured()) {
      this.logger.warn(
        { userId: params.userId, refId: params.refId },
        'Renewal reminder skipped — SMTP is not configured',
      );
      return false;
    }
    try {
      const user = await this.usersRepository.findById(params.userId);
      const email = user?.email?.trim();
      if (!email) {
        this.logger.warn(
          { userId: params.userId, refId: params.refId },
          'Renewal reminder skipped — user has no email',
        );
        return false;
      }
      const currency = params.currency ?? 'INR';
      const productLine = [params.productName, params.variantName].filter(Boolean).join(' · ');
      const skuLine = params.sku ? `SKU: ${params.sku}` : null;
      const autopayNote = params.autopayEnabled
        ? 'AutoPay remains enabled for the scheduled renewal unless you pay early and the payment is confirmed.'
        : 'You can pay early using the secure link below.';
      const subject = `Renewal reminder: ${productLine || 'your subscription'} in ${params.daysBefore} day${params.daysBefore === 1 ? '' : 's'}`;
      const text = [
        `Your Cureka subscription${params.refId ? ` (${params.refId})` : ''} renews in ${params.daysBefore} day${params.daysBefore === 1 ? '' : 's'}.`,
        productLine ? `Product: ${productLine}` : null,
        skuLine,
        `Amount: ${currency} ${params.amount}`,
        `Scheduled renewal: ${params.scheduledRenewalDate}`,
        autopayNote,
        `Pay early securely: ${params.paymentLink}`,
      ]
        .filter(Boolean)
        .join('\n');
      const html = `
        <p>Your Cureka subscription${params.refId ? ` (<strong>${escapeHtml(params.refId)}</strong>)` : ''} renews in <strong>${params.daysBefore}</strong> day${params.daysBefore === 1 ? '' : 's'}.</p>
        ${productLine ? `<p>Product: ${escapeHtml(productLine)}</p>` : ''}
        ${skuLine ? `<p>${escapeHtml(skuLine)}</p>` : ''}
        <p>Amount: <strong>${escapeHtml(currency)} ${escapeHtml(params.amount)}</strong></p>
        <p>Scheduled renewal: <strong>${escapeHtml(params.scheduledRenewalDate)}</strong></p>
        <p>${escapeHtml(autopayNote)}</p>
        <p><a href="${escapeHtmlAttr(params.paymentLink)}">Pay early securely</a></p>
      `.trim();
      await this.mailService.send({ to: [email], subject, text, html });
      return true;
    } catch (error) {
      this.logger.warn(
        {
          userId: params.userId,
          refId: params.refId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Renewal reminder email failed (non-blocking)',
      );
      return false;
    }
  }

  private async sendSafely(
    context: string,
    userId: string,
    fn: (phone: string) => Promise<void>,
  ): Promise<void> {
    try {
      const user = await this.usersRepository.findById(userId);
      const phone = user?.mobileNumber;
      if (!phone) {
        this.logger.warn({ userId, context }, 'Skipping subscription notification — no phone');
        return;
      }
      await fn(phone);
    } catch (error) {
      this.logger.warn(
        {
          userId,
          context,
          error: error instanceof Error ? error.message : String(error),
        },
        'Subscription notification failed (non-blocking)',
      );
    }
  }

  private async sendSmsOrLog(
    phone: string,
    payload: Record<string, string | undefined>,
  ): Promise<void> {
    if (!this.msg91SmsService.isConfigured()) {
      this.logger.log(
        { phoneSuffix: phone.slice(-4), ...payload },
        'MSG91 not configured — skipping subscription SMS',
      );
    } else {
      this.logger.log(
        { phoneSuffix: phone.slice(-4), ...payload },
        'Subscription SMS template not configured — logged only',
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
