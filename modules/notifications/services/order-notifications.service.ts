import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Msg91OrderField } from '../interfaces/msg91-sms.interface';
import {
  IOrderPlacedNotifyInput,
  WhatsAppBodyVariable,
} from '../interfaces/whatsapp-send.interface';
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
        'var:customerName',
        'var1:orderNumber',
        'var2:grandTotal',
      ],
    );
  }

  /**
   * Fire-and-forget safe wrapper — never throws to the order flow.
   * Sends WhatsApp + MSG91 thank-you SMS independently.
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

    const values = this.fieldValues(input);
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
    if (!this.msg91SmsService.isConfigured()) {
      this.logger.log(
        { orderNumber: input.orderNumber, source: input.source },
        '[MSG91-SMS] Order thank-you skipped — MSG91 disabled/unconfigured',
      );
      return;
    }

    if (!this.smsTemplateId) {
      this.logger.warn(
        { orderNumber: input.orderNumber },
        '[MSG91-SMS] MSG91_ORDER_THANKYOU_TEMPLATE_ID is empty — skipping',
      );
      return;
    }

    if (!input.phoneNumber?.trim()) {
      this.logger.warn(
        { orderNumber: input.orderNumber },
        '[MSG91-SMS] Order has no phone number — skipping',
      );
      return;
    }

    const values = this.fieldValues(input);
    const variables: Record<string, string> = {};
    for (const pair of this.smsVarPairs) {
      variables[pair.templateKey] = values[pair.field] ?? '';
    }

    this.logger.log(
      {
        orderNumber: input.orderNumber,
        source: input.source,
        templateId: this.smsTemplateId,
        variableKeys: Object.keys(variables),
      },
      '[MSG91-SMS] Sending order thank-you SMS',
    );

    await this.msg91SmsService.sendFlowSms({
      templateId: this.smsTemplateId,
      phone: input.phoneNumber,
      variables,
    });
  }

  private fieldValues(input: IOrderPlacedNotifyInput): Record<Msg91OrderField, string> {
    return {
      customerName: input.customerName || 'Customer',
      orderNumber: input.orderNumber,
      grandTotal: input.grandTotal,
      paymentMethod: input.paymentMethod,
      orderStatus: input.orderStatus,
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
