import { Injectable, Logger } from '@nestjs/common';
import { Msg91SmsService } from '@modules/notifications/services/msg91-sms.service';
import { UsersRepository } from '@modules/users/repositories/users.repository';

@Injectable()
export class SubscriptionNotificationsService {
  private readonly logger = new Logger(SubscriptionNotificationsService.name);

  constructor(
    private readonly msg91SmsService: Msg91SmsService,
    private readonly usersRepository: UsersRepository,
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
      // Template IDs for subscription flows are not yet configured in env;
      // log and continue without throwing so renewals are never blocked.
      this.logger.log(
        { phoneSuffix: phone.slice(-4), ...payload },
        'Subscription SMS template not configured — logged only',
      );
    }
  }
}
