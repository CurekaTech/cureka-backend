import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMobileNumber } from '@modules/auth/utils/mobile-number.util';
import {
  IMsg91FlowSendPayload,
  IMsg91FlowSendResult,
} from '../interfaces/msg91-sms.interface';

/**
 * MSG91 SMS client — Flow API for transactional SMS (thank-you, etc.).
 * Docs: https://docs.msg91.com/sms/send-sms
 * Endpoint: POST https://control.msg91.com/api/v5/flow
 */
@Injectable()
export class Msg91SmsService {
  private readonly logger = new Logger(Msg91SmsService.name);
  private readonly enabled: boolean;
  private readonly authKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly shortUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('msg91.enabled') ?? false;
    this.authKey = this.configService.get<string>('msg91.authKey') ?? '';
    this.baseUrl = (
      this.configService.get<string>('msg91.baseUrl') ?? 'https://control.msg91.com/api/v5'
    ).replace(/\/$/, '');
    this.timeoutMs = this.configService.get<number>('msg91.timeoutMs') ?? 15000;
    this.shortUrl = this.configService.get<string>('msg91.shortUrl') ?? '0';

    this.logger.log(
      {
        enabled: this.enabled,
        authKeyConfigured: Boolean(this.authKey),
        baseUrl: this.baseUrl,
        timeoutMs: this.timeoutMs,
      },
      '[MSG91] SMS service configured',
    );
  }

  isConfigured(): boolean {
    return this.enabled && Boolean(this.authKey) && Boolean(this.baseUrl);
  }

  /** Formats Indian mobile as 91XXXXXXXXXX (MSG91 international format). */
  toMsg91Mobile(phoneNumber: string): string {
    const digits = normalizeMobileNumber(phoneNumber);
    if (digits.startsWith('91') && digits.length === 12) return digits;
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }

  async sendFlowSms(params: {
    templateId: string;
    phone: string;
    /** Template placeholders, e.g. { var: 'Dinesh', var1: 'ORD123' } */
    variables: Record<string, string>;
  }): Promise<IMsg91FlowSendResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        {
          enabled: this.enabled,
          authKeyConfigured: Boolean(this.authKey),
        },
        '[MSG91] Skipping Flow SMS — not configured or disabled',
      );
      return { httpStatus: 0, body: { skipped: true } };
    }

    if (!params.templateId?.trim()) {
      throw new ServiceUnavailableException('MSG91 Flow template_id is empty');
    }

    const mobiles = this.toMsg91Mobile(params.phone);
    if (!mobiles) {
      throw new ServiceUnavailableException('MSG91 mobile number is empty');
    }

    const payload: IMsg91FlowSendPayload = {
      template_id: params.templateId.trim(),
      short_url: this.shortUrl,
      realTimeResponse: '1',
      recipients: [
        {
          mobiles,
          ...params.variables,
        },
      ],
    };

    const url = `${this.baseUrl}/flow`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    this.logger.log(
      {
        url,
        templateId: params.templateId,
        phone: this.maskPhone(mobiles),
        variableKeys: Object.keys(params.variables),
      },
      '[MSG91] Sending Flow SMS',
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authkey: this.authKey,
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
          templateId: params.templateId,
          phone: this.maskPhone(mobiles),
          elapsedMs: Date.now() - startedAt,
          httpStatus: response.status,
          ok: response.ok,
          body: parsed,
        },
        '[MSG91] Flow SMS API response',
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `MSG91 Flow SMS failed with HTTP ${response.status}`,
        );
      }

      return { httpStatus: response.status, body: parsed };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        {
          templateId: params.templateId,
          phone: this.maskPhone(mobiles),
          elapsedMs: Date.now() - startedAt,
          timedOut: isAbort,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        isAbort ? '[MSG91] Flow SMS timed out' : '[MSG91] Flow SMS request failed',
      );
      throw new ServiceUnavailableException(
        isAbort
          ? `MSG91 Flow SMS timed out after ${this.timeoutMs}ms`
          : 'MSG91 SMS API is unavailable',
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
