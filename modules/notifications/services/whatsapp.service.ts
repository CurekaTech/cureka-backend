import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMobileNumber } from '@modules/auth/utils/mobile-number.util';
import {
  IWhatsAppTemplateBodyPart,
  IWhatsAppTemplateSendPayload,
} from '../interfaces/whatsapp-send.interface';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly enabled: boolean;
  private readonly sendUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('whatsapp.enabled') ?? false;
    this.sendUrl = this.configService.get<string>('whatsapp.sendUrl') ?? '';
    this.apiKey = this.configService.get<string>('whatsapp.apiKey') ?? '';
    this.timeoutMs = this.configService.get<number>('whatsapp.timeoutMs') ?? 15000;

    this.logger.log(
      {
        enabled: this.enabled,
        sendUrlConfigured: Boolean(this.sendUrl),
        apiKeyConfigured: Boolean(this.apiKey),
        timeoutMs: this.timeoutMs,
      },
      '[WhatsApp] Service configured',
    );
  }

  isConfigured(): boolean {
    return this.enabled && Boolean(this.sendUrl) && Boolean(this.apiKey);
  }

  /** Formats 10-digit Indian mobile as 91XXXXXXXXXX for WhatsApp. */
  toWhatsAppPhone(phoneNumber: string): string {
    const digits = normalizeMobileNumber(phoneNumber);
    if (digits.startsWith('91') && digits.length === 12) return digits;
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }

  async sendTemplate(params: {
    phone: string;
    templateName: string;
    language: string;
    bodyTexts: string[];
  }): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        {
          enabled: this.enabled,
          sendUrlConfigured: Boolean(this.sendUrl),
          apiKeyConfigured: Boolean(this.apiKey),
        },
        '[WhatsApp] Skipping send — not configured or disabled',
      );
      return;
    }

    const phone = this.toWhatsAppPhone(params.phone);
    if (!phone) {
      throw new ServiceUnavailableException('WhatsApp phone number is empty');
    }

    const body: IWhatsAppTemplateBodyPart[] = params.bodyTexts.map((text) => ({
      type: 'text',
      text,
    }));

    const payload: IWhatsAppTemplateSendPayload = {
      phone,
      type: 'template',
      name: params.templateName,
      language: params.language,
      body,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    this.logger.log(
      {
        phone: this.maskPhone(phone),
        templateName: params.templateName,
        language: params.language,
        bodyCount: body.length,
        url: this.sendUrl,
      },
      '[WhatsApp] Sending template message',
    );

    try {
      const response = await fetch(this.sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { rawBody: text.slice(0, 500) };
      }

      this.logger.log(
        {
          phone: this.maskPhone(phone),
          templateName: params.templateName,
          elapsedMs: Date.now() - startedAt,
          httpStatus: response.status,
          ok: response.ok,
          body: parsed,
        },
        '[WhatsApp] API response',
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `WhatsApp send failed with HTTP ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        {
          phone: this.maskPhone(phone),
          templateName: params.templateName,
          elapsedMs: Date.now() - startedAt,
          timedOut: isAbort,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        isAbort ? '[WhatsApp] Request timed out' : '[WhatsApp] Request failed',
      );
      throw new ServiceUnavailableException(
        isAbort ? `WhatsApp request timed out after ${this.timeoutMs}ms` : 'WhatsApp API is unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private maskPhone(phone: string): string {
    if (phone.length < 6) return '***';
    return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
  }
}
