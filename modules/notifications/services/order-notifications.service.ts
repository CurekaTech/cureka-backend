import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IOrderPlacedNotifyInput,
  WhatsAppBodyVariable,
} from '../interfaces/whatsapp-send.interface';
import { WhatsappService } from './whatsapp.service';

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);
  private readonly templateName: string;
  private readonly language: string;
  private readonly bodyVars: WhatsAppBodyVariable[];

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
  ) {
    this.templateName = this.configService.get<string>('whatsapp.orderPlacedTemplateName') ?? '';
    this.language = this.configService.get<string>('whatsapp.orderPlacedLanguage') ?? 'en_US';
    this.bodyVars = (this.configService.get<string[]>('whatsapp.orderPlacedBodyVars') ?? [
      'customerName',
      'orderNumber',
      'grandTotal',
    ]) as WhatsAppBodyVariable[];
  }

  /**
   * Fire-and-forget safe wrapper — never throws to the order flow.
   */
  async notifyOrderPlacedSafely(input: IOrderPlacedNotifyInput): Promise<void> {
    try {
      await this.notifyOrderPlaced(input);
    } catch (error) {
      this.logger.error(
        {
          orderNumber: input.orderNumber,
          source: input.source,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        '[WhatsApp] Order placed notification failed (non-blocking)',
      );
    }
  }

  async notifyOrderPlaced(input: IOrderPlacedNotifyInput): Promise<void> {
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

    const values: Record<WhatsAppBodyVariable, string> = {
      customerName: input.customerName || 'Customer',
      orderNumber: input.orderNumber,
      grandTotal: input.grandTotal,
      paymentMethod: input.paymentMethod,
      orderStatus: input.orderStatus,
    };

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
}
