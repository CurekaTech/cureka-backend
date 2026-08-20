import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IOrderNotifyInput } from '../interfaces/order-notify.interface';
import { Msg91OrderField } from '../interfaces/msg91-sms.interface';
import { mapOrderStatusForSms } from '../utils/order-status-sms.util';
import { Msg91SmsService } from './msg91-sms.service';

type NotifyEvent = 'orderPlaced' | 'orderCancelled';

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  private readonly smsTemplates: Record<
    NotifyEvent,
    {
      templateId: string;
      varPairs: Array<{ templateKey: string; field: Msg91OrderField }>;
      templateTextPreview: string;
    }
  >;

  constructor(
    private readonly configService: ConfigService,
    private readonly msg91SmsService: Msg91SmsService,
  ) {
    this.smsTemplates = {
      orderPlaced: {
        templateId: this.configService.get<string>('msg91.orderThankYouTemplateId') ?? '',
        varPairs: this.parseSmsVarPairs(
          this.configService.get<string[]>('msg91.orderThankYouVars') ?? [
            'var1:orderNumber',
            'var2:orderStatus',
          ],
        ),
        templateTextPreview:
          this.configService.get<string>('msg91.orderThankYouTemplateText') ?? '',
      },
      orderCancelled: {
        templateId: this.configService.get<string>('msg91.orderCancelledTemplateId') ?? '',
        varPairs: this.parseSmsVarPairs(
          this.configService.get<string[]>('msg91.orderCancelledVars') ?? [
            'var1:orderNumber',
            'var2:cancelReason',
          ],
        ),
        templateTextPreview:
          this.configService.get<string>('msg91.orderCancelledTemplateText') ?? '',
      },
    };

    this.logger.log(
      {
        smsServiceReady: this.msg91SmsService.isConfigured(),
        templates: {
          orderPlaced: Boolean(this.smsTemplates.orderPlaced.templateId.trim()),
          orderCancelled: Boolean(this.smsTemplates.orderCancelled.templateId.trim()),
        },
        configSource: 'apps/api/config/msg91.constants.ts',
      },
      '[OrderNotifications] SMS template config presence check',
    );
  }

  /**
   * Fire-and-forget — never throws to the order flow.
   * WhatsApp is BOB `/orders-create` (not this service). This sends MSG91 SMS only.
   */
  async notifyOrderPlacedSafely(input: IOrderNotifyInput): Promise<void> {
    await this.notifySmsSafely('orderPlaced', input);
  }

  async notifyOrderCancelledSafely(input: IOrderNotifyInput): Promise<void> {
    await this.notifySmsSafely('orderCancelled', input);
  }

  private async notifySmsSafely(event: NotifyEvent, input: IOrderNotifyInput): Promise<void> {
    const label = event === 'orderPlaced' ? 'order placed' : 'order cancelled';
    try {
      await this.notifySms(event, input);
    } catch (error) {
      this.logger.error(
        {
          channel: `MSG91-SMS:${event}`,
          orderNumber: input.orderNumber,
          source: input.source,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        `[MSG91-SMS] ${label} notification failed (non-blocking)`,
      );
    }
  }

  private async notifySms(event: NotifyEvent, input: IOrderNotifyInput): Promise<void> {
    const label = event === 'orderPlaced' ? 'Order thank-you' : 'Order cancelled';
    const { templateId, varPairs, templateTextPreview } = this.smsTemplates[event];
    const smsOrderStatus = mapOrderStatusForSms(input.orderStatus);
    const context = {
      orderNumber: input.orderNumber,
      source: input.source,
      paymentMethod: input.paymentMethod,
      orderStatusRaw: input.orderStatus,
      orderStatusSms: smsOrderStatus,
      event,
      sender: this.msg91SmsService.getSenderId(),
      dltTemplateId: this.msg91SmsService.getDltTemplateId() || null,
    };

    if (!this.msg91SmsService.isConfigured()) {
      this.logger.warn(
        { ...context, reason: 'msg91_disabled_or_unconfigured' },
        `[MSG91-SMS] ${label} skipped`,
      );
      return;
    }

    if (!templateId.trim()) {
      this.logger.warn(
        { ...context, reason: 'empty_template_id' },
        `[MSG91-SMS] ${label} skipped — set template id in msg91.constants.ts`,
      );
      return;
    }

    if (!input.phoneNumber?.trim()) {
      this.logger.warn(
        { ...context, reason: 'missing_phone' },
        `[MSG91-SMS] ${label} skipped — order has no phone number`,
      );
      return;
    }

    if (!varPairs.length) {
      this.logger.warn(
        { ...context, reason: 'empty_var_pairs' },
        `[MSG91-SMS] ${label} skipped — no valid var pairs in msg91.constants.ts`,
      );
      return;
    }

    const values = this.fieldValues(input, smsOrderStatus);
    const variables: Record<string, string> = {};
    for (const pair of varPairs) {
      variables[pair.templateKey] = this.truncateForDlt(values[pair.field] ?? '');
    }

    this.logger.log(
      {
        ...context,
        stage: 'start',
        flowId: templateId,
        phone: this.maskPhone(input.phoneNumber),
        varPairs,
        variables,
      },
      `[MSG91-SMS] ${label} SMS start`,
    );

    const result = await this.msg91SmsService.sendFlowSms({
      templateId,
      phone: input.phoneNumber,
      variables,
      context,
      templateTextPreview,
    });

    if (result.skipped) {
      this.logger.warn(
        { ...context, reason: 'provider_skipped' },
        `[MSG91-SMS] ${label} skipped by provider client`,
      );
      return;
    }

    this.logger.log(
      {
        ...context,
        stage: 'done',
        flowId: templateId,
        httpStatus: result.httpStatus,
        requestId: result.requestId,
        providerStatus: result.providerStatus,
        rawBody: result.rawBody,
        responseHeaders: result.responseHeaders,
        body: result.body,
      },
      `[MSG91-SMS] ${label} SMS completed`,
    );
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return '***';
    return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
  }

  private truncateForDlt(value: string, max = 40): string {
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
  }

  private fieldValues(
    input: IOrderNotifyInput,
    smsOrderStatus: string,
  ): Record<Msg91OrderField, string> {
    return {
      customerName: input.customerName || 'Customer',
      orderNumber: input.orderNumber,
      grandTotal: input.grandTotal,
      paymentMethod: input.paymentMethod,
      orderStatus: smsOrderStatus,
      cancelReason: (input.cancelReason ?? '').trim() || 'Cancelled',
    };
  }

  private parseSmsVarPairs(
    raw: string[],
  ): Array<{ templateKey: string; field: Msg91OrderField }> {
    const allowed = new Set<Msg91OrderField>([
      'customerName',
      'orderNumber',
      'grandTotal',
      'paymentMethod',
      'orderStatus',
      'cancelReason',
    ]);

    const pairs: Array<{ templateKey: string; field: Msg91OrderField }> = [];
    for (const entry of raw) {
      const [templateKey, field] = entry.split(':').map((part) => part.trim());
      if (!templateKey || !field || !allowed.has(field as Msg91OrderField)) {
        this.logger.warn(
          { entry },
          '[MSG91-SMS] Ignoring invalid var entry (expected templateKey:field)',
        );
        continue;
      }
      pairs.push({ templateKey, field: field as Msg91OrderField });
    }
    return pairs;
  }
}
