import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Msg91OrderField } from '../interfaces/msg91-sms.interface';
import {
  IOrderPlacedNotifyInput,
  WhatsAppBodyVariable,
} from '../interfaces/whatsapp-send.interface';
import { mapOrderStatusForSms } from '../utils/order-status-sms.util';
import { Msg91SmsService } from './msg91-sms.service';
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);
  private readonly templateName: string;
  private readonly language: string;
  private readonly bodyVars: WhatsAppBodyVariable[];
  private readonly smsTemplateId: string;
  private readonly smsVarPairs: Array<{ templateKey: string; field: Msg91OrderField }>;

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
    private readonly msg91SmsService: Msg91SmsService,
  ) {
    this.templateName = this.configService.get<string>('whatsapp.orderPlacedTemplateName') ?? '';
    this.language = this.configService.get<string>('whatsapp.orderPlacedLanguage') ?? 'en_US';
    this.bodyVars = (this.configService.get<string[]>('whatsapp.orderPlacedBodyVars') ?? [
      'customerName',
      'orderNumber',
      'grandTotal',
    ]) as WhatsAppBodyVariable[];

    this.smsTemplateId = this.configService.get<string>('msg91.orderThankYouTemplateId') ?? '';
    this.smsVarPairs = this.parseSmsVarPairs(
      this.configService.get<string[]>('msg91.orderThankYouVars') ?? [
        'var1:orderNumber',
        'var2:orderStatus',
      ],
    );

    this.logger.log(
      {
        smsServiceReady: this.msg91SmsService.isConfigured(),
        MSG91_ORDER_THANKYOU_TEMPLATE_ID: Boolean(this.smsTemplateId?.trim()),
        MSG91_ORDER_THANKYOU_VARS_parsed: this.smsVarPairs.length > 0,
        whatsappServiceReady: this.whatsappService.isConfigured(),
        WHATSAPP_ORDER_PLACED_TEMPLATE: Boolean(this.templateName?.trim()),
      },
      '[OrderNotifications] Env/config presence check (true/false only)',
    );
  }

  /**
   * Fire-and-forget safe wrapper — never throws to the order flow.
   * Sends WhatsApp (Bonb) + MSG91 thank-you SMS independently.
   */
  async notifyOrderPlacedSafely(input: IOrderPlacedNotifyInput): Promise<void> {
    await Promise.all([
      this.runSafely('WhatsApp', input, () => this.notifyOrderPlacedWhatsApp(input)),
      this.runSafely('MSG91-SMS', input, () => this.notifyOrderPlacedSms(input)),
    ]);
  }

  /** @deprecated use notifyOrderPlacedSafely — kept for callers that expect WhatsApp-only name */
  async notifyOrderPlaced(input: IOrderPlacedNotifyInput): Promise<void> {
    await this.notifyOrderPlacedWhatsApp(input);
  }

  private async runSafely(
    channel: string,
    input: IOrderPlacedNotifyInput,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        {
          channel,
          orderNumber: input.orderNumber,
          source: input.source,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        `[${channel}] Order placed notification failed (non-blocking)`,
      );
    }
  }

  private async notifyOrderPlacedWhatsApp(input: IOrderPlacedNotifyInput): Promise<void> {
    if (!this.whatsappService.isConfigured()) {
      this.logger.log(
        { orderNumber: input.orderNumber, source: input.source },
        '[WhatsApp] Order placed notify skipped — WhatsApp disabled/unconfigured',
      );
      return;
    }

    if (!this.templateName) {
      this.logger.warn(
        { orderNumber: input.orderNumber },
        '[WhatsApp] WHATSAPP_ORDER_PLACED_TEMPLATE is empty — skipping',
      );
      return;
    }

    if (!input.phoneNumber?.trim()) {
      this.logger.warn(
        { orderNumber: input.orderNumber },
        '[WhatsApp] Order has no phone number — skipping',
      );
      return;
    }

    const values = this.fieldValues(input, mapOrderStatusForSms(input.orderStatus));
    const bodyTexts = this.bodyVars.map((key) => values[key] ?? '');

    this.logger.log(
      {
        orderNumber: input.orderNumber,
        source: input.source,
        templateName: this.templateName,
        language: this.language,
        bodyVars: this.bodyVars,
        bodyTexts,
      },
      '[WhatsApp] Sending order placed notification',
    );

    await this.whatsappService.sendTemplate({
      phone: input.phoneNumber,
      templateName: this.templateName,
      language: this.language,
      bodyTexts,
    });
  }

  /**
   * Thank-you SMS via MSG91 Flow API.
   * Docs: https://docs.msg91.com/sms/send-sms
   */
  private async notifyOrderPlacedSms(input: IOrderPlacedNotifyInput): Promise<void> {
    const smsOrderStatus = mapOrderStatusForSms(input.orderStatus);
    const context = {
      orderNumber: input.orderNumber,
      source: input.source,
      paymentMethod: input.paymentMethod,
      orderStatusRaw: input.orderStatus,
      orderStatusSms: smsOrderStatus,
      sender: this.msg91SmsService.getSenderId(),
      dltTemplateId: this.msg91SmsService.getDltTemplateId() || null,
    };

    if (!this.msg91SmsService.isConfigured()) {
      this.logger.warn(
        { ...context, reason: 'msg91_disabled_or_unconfigured' },
        '[MSG91-SMS] Order thank-you skipped',
      );
      return;
    }

    if (!this.smsTemplateId) {
      this.logger.warn(
        { ...context, reason: 'empty_template_id' },
        '[MSG91-SMS] Order thank-you skipped — MSG91_ORDER_THANKYOU_TEMPLATE_ID is empty',
      );
      return;
    }

    if (!input.phoneNumber?.trim()) {
      this.logger.warn(
        { ...context, reason: 'missing_phone' },
        '[MSG91-SMS] Order thank-you skipped — order has no phone number',
      );
      return;
    }

    if (!this.smsVarPairs.length) {
      this.logger.warn(
        { ...context, reason: 'empty_var_pairs' },
        '[MSG91-SMS] Order thank-you skipped — MSG91_ORDER_THANKYOU_VARS has no valid pairs',
      );
      return;
    }

    const values = this.fieldValues(input, smsOrderStatus);
    const variables: Record<string, string> = {};
    for (const pair of this.smsVarPairs) {
      variables[pair.templateKey] = values[pair.field] ?? '';
    }

    this.logger.log(
      {
        ...context,
        stage: 'start',
        flowId: this.smsTemplateId,
        phone: this.maskPhone(input.phoneNumber),
        varPairs: this.smsVarPairs,
        variables,
        var1: variables['var1'] ?? null,
        var2: variables['var2'] ?? null,
      },
      '[MSG91-SMS] Order thank-you SMS start',
    );

    const result = await this.msg91SmsService.sendFlowSms({
      templateId: this.smsTemplateId,
      phone: input.phoneNumber,
      variables,
      context,
    });

    if (result.skipped) {
      this.logger.warn(
        { ...context, reason: 'provider_skipped' },
        '[MSG91-SMS] Order thank-you skipped by provider client',
      );
      return;
    }

    this.logger.log(
      {
        ...context,
        stage: 'done',
        flowId: this.smsTemplateId,
        httpStatus: result.httpStatus,
        requestId: result.requestId,
        providerStatus: result.providerStatus,
        rawBody: result.rawBody,
        responseHeaders: result.responseHeaders,
        body: result.body,
      },
      '[MSG91-SMS] Order thank-you SMS completed',
    );
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return '***';
    return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
  }

  private fieldValues(
    input: IOrderPlacedNotifyInput,
    smsOrderStatus: string,
  ): Record<Msg91OrderField, string> {
    return {
      customerName: input.customerName || 'Customer',
      orderNumber: input.orderNumber,
      grandTotal: input.grandTotal,
      paymentMethod: input.paymentMethod,
      orderStatus: smsOrderStatus,
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
    ]);

    const pairs: Array<{ templateKey: string; field: Msg91OrderField }> = [];
    for (const entry of raw) {
      const [templateKey, field] = entry.split(':').map((part) => part.trim());
      if (!templateKey || !field || !allowed.has(field as Msg91OrderField)) {
        this.logger.warn(
          { entry },
          '[MSG91-SMS] Ignoring invalid MSG91_ORDER_THANKYOU_VARS entry (expected templateKey:field)',
        );
        continue;
      }
      pairs.push({ templateKey, field: field as Msg91OrderField });
    }
    return pairs;
  }
}
